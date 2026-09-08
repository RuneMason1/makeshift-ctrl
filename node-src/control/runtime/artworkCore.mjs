import { createHash } from 'node:crypto'

export class ArtworkAssetStore {
  constructor(byteLimit = 128 * 1024 * 1024) {
    this.byteLimit = byteLimit
    this.usedBytes = 0
    this.entries = new Map()
    this.identities = new Map()
    this.pending = new Map()
  }

  publish(identity, bytes) {
    if (!identity || !Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new Error('Artwork assets require a stable identity and Buffer payload')
    }
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const assetKey = `${identity}@${contentHash}`
    const existing = this.entries.get(assetKey)
    if (existing) {
      existing.lastUsedAt = Date.now()
      this.identities.set(identity, assetKey)
      return assetKey
    }
    const entry = { bytes: Buffer.from(bytes), leases: 0, lastUsedAt: Date.now() }
    this.entries.set(assetKey, entry)
    this.identities.set(identity, assetKey)
    this.usedBytes += entry.bytes.length
    this.evict()
    return assetKey
  }

  async prepare(identity, producer) {
    const existingKey = this.identities.get(identity)
    if (existingKey && this.entries.has(existingKey)) {
      this.entries.get(existingKey).lastUsedAt = Date.now()
      return existingKey
    }
    const pending = this.pending.get(identity)
    if (pending) return pending
    const task = Promise.resolve()
      .then(producer)
      .then(bytes => this.publish(identity, bytes))
      .finally(() => this.pending.delete(identity))
    this.pending.set(identity, task)
    return task
  }

  lease(assetKey) {
    const entry = this.entries.get(assetKey)
    if (!entry) return undefined
    entry.leases++
    entry.lastUsedAt = Date.now()
    let released = false
    return Object.freeze({
      bytes: entry.bytes,
      release: () => {
        if (released) return
        released = true
        entry.leases--
        entry.lastUsedAt = Date.now()
        this.evict()
      },
    })
  }

  invalidatePrefix(prefix) {
    for (const identity of this.identities.keys()) {
      if (identity.startsWith(prefix)) this.identities.delete(identity)
    }
  }

  snapshot() {
    return Object.freeze({
      entries: this.entries.size,
      prepared: this.identities.size,
      preparing: this.pending.size,
      usedBytes: this.usedBytes,
      byteLimit: this.byteLimit,
    })
  }

  evict() {
    while (this.usedBytes > this.byteLimit) {
      const oldest = [...this.entries.entries()]
        .filter(([, entry]) => entry.leases === 0)
        .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0]
      if (!oldest) return
      this.entries.delete(oldest[0])
      for (const [identity, assetKey] of this.identities) {
        if (assetKey === oldest[0]) this.identities.delete(identity)
      }
      this.usedBytes -= oldest[1].bytes.length
    }
  }
}

export class ArtworkTransferScheduler {
  constructor() {
    this.pending = []
    this.pendingByKey = new Map()
    this.running = false
  }

  enqueue(job) {
    if (job.key) {
      const existing = this.pendingByKey.get(job.key)
      if (existing) {
        if (job.priority < existing.priority) {
          existing.priority = job.priority
          this.pending.sort((left, right) => left.priority - right.priority)
        }
        return existing.promise
      }
    }
    const entry = { ...job }
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve
      entry.reject = reject
      this.pending.push(entry)
      if (entry.key) this.pendingByKey.set(entry.key, entry)
      this.pending.sort((left, right) => left.priority - right.priority)
      void this.drain()
    })
    return entry.promise
  }

  promote(key, priority) {
    const existing = this.pendingByKey.get(key)
    if (!existing || priority >= existing.priority) return false
    existing.priority = priority
    this.pending.sort((left, right) => left.priority - right.priority)
    return true
  }

  snapshot() {
    return Object.freeze({
      running: this.running,
      queued: this.pending.length,
      priorities: this.pending.map(job => job.priority),
    })
  }

  async drain() {
    if (this.running) return
    this.running = true
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift()
        if (job.key) this.pendingByKey.delete(job.key)
        if (!job.isCurrent()) { job.resolve(false); continue }
        try { job.resolve(await job.execute()) } catch (error) { job.reject(error) }
      }
    } finally {
      this.running = false
      if (this.pending.length > 0) void this.drain()
    }
  }
}

// Compatibility adapter for the current firmware's seven direct-art slots.
// Future firmware can replace this without changing providers or the store.
export class LegacyArtworkResidency {
  constructor(capacity = 7) {
    this.slots = Array(capacity).fill(null)
  }

  reset() {
    this.slots.fill(null)
  }

  clear(slot) {
    if (slot >= 0 && slot < this.slots.length) this.slots[slot] = null
  }

  bind(slot, identity) {
    if (slot >= 0 && slot < this.slots.length) this.slots[slot] = identity
  }

  has(identity) {
    return this.slots.includes(identity)
  }

  findSlot(predicate) {
    return this.slots.findIndex(predicate)
  }

  snapshot() {
    return [...this.slots]
  }
}

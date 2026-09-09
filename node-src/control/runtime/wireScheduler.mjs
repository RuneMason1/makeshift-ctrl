// One connection owns the wire. Jobs from an older connection epoch never
// reach a newly connected device, and selected work can outrank preloads.
export class WireScheduler {
  constructor() { this.epoch = 0; this.queue = []; this.running = false; this.sequence = 0 }
  beginEpoch() { this.epoch++; this.queue.splice(0).forEach(job => job.resolve(false)); return this.epoch }
  cancel({ epoch, key, predicate } = {}) {
    const retained = []
    let cancelled = 0
    for (const job of this.queue) {
      const matches = (epoch === undefined || job.epoch === epoch) &&
        (key === undefined || job.key === key) &&
        (!predicate || predicate(job))
      if (matches) { job.resolve(false); cancelled++ } else retained.push(job)
    }
    this.queue = retained
    return cancelled
  }
  enqueue({ epoch = this.epoch, key, priority = 1, replace = false, execute }) {
    return new Promise((resolve, reject) => {
      if (replace && key !== undefined) this.cancel({ epoch, key })
      this.queue.push({ epoch, key, priority, execute, resolve, reject, order: ++this.sequence })
      this.queue.sort((a, b) => a.priority - b.priority || a.order - b.order)
      void this.drain()
    })
  }
  async drain() {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const job = this.queue.shift()
        if (job.epoch !== this.epoch) { job.resolve(false); continue }
        try { job.resolve(await job.execute()) } catch (error) { job.reject(error) }
      }
    } finally { this.running = false }
  }
}

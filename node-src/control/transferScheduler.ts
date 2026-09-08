export type TransferPriority = 0 | 1 | 2

export type TransferIdentity = Readonly<{
  connectionId: number
  sessionId: number
  assetKey: string
  reason: 'selected' | 'neighbor' | 'preload'
}>

export type TransferJob = Readonly<{
  identity: TransferIdentity
  priority: TransferPriority
  isCurrent: () => boolean
  run: () => Promise<void>
}>

/** One ordered lane for all providers. Stale jobs send zero bytes. */
export class TransferScheduler {
  private readonly queued: TransferJob[] = []
  private running = false

  enqueue(job: TransferJob): void {
    const duplicate = this.queued.findIndex(candidate =>
      candidate.identity.connectionId === job.identity.connectionId &&
      candidate.identity.sessionId === job.identity.sessionId &&
      candidate.identity.assetKey === job.identity.assetKey)
    if (duplicate >= 0) this.queued.splice(duplicate, 1)
    this.queued.push(job)
    this.queued.sort((left, right) => left.priority - right.priority)
    void this.drain()
  }

  cancelStale(): void {
    for (let index = this.queued.length - 1; index >= 0; index--) {
      if (!this.queued[index].isCurrent()) this.queued.splice(index, 1)
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queued.length > 0) {
        const job = this.queued.shift()!
        if (!job.isCurrent()) continue
        await job.run()
      }
    } finally {
      this.running = false
      if (this.queued.length > 0) void this.drain()
    }
  }
}

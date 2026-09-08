// One connection owns the wire. Jobs from an older connection epoch never
// reach a newly connected device, and selected work can outrank preloads.
export class WireScheduler {
  constructor() { this.epoch = 0; this.queue = []; this.running = false }
  beginEpoch() { this.epoch++; this.queue.splice(0).forEach(job => job.resolve(false)); return this.epoch }
  enqueue({ epoch = this.epoch, key, priority = 1, execute }) {
    return new Promise((resolve, reject) => {
      this.queue.push({ epoch, key, priority, execute, resolve, reject, order: Date.now() + Math.random() })
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

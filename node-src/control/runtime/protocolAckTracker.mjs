export class ProtocolAckTracker {
  constructor({ timeoutMs = 3000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.timeoutMs = timeoutMs
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.pending = new Map()
  }

  waitFor(request, { epoch = 0, transactionId = 0 } = {}) {
    const key = `${epoch}/${request}/${transactionId}`
    if (this.pending.has(key)) throw new Error(`ACK already pending for packet ${request}`)
    let timer
    const promise = new Promise((resolve, reject) => {
      timer = this.setTimer(() => {
        this.pending.delete(key)
        reject(new Error(`Timed out waiting for firmware ACK for packet ${request}`))
      }, this.timeoutMs)
      this.pending.set(key, { resolve, reject, timer })
    })
    return promise
  }

  accept(packet, { epoch = 0 } = {}) {
    if (!packet || packet[0] !== 1 || packet.length < 2) return false
    const transactionId = packet.length >= 4 ? (packet[2] << 8) | packet[3] : 0
    const key = `${epoch}/${packet[1]}/${transactionId}`
    const pending = this.pending.get(key)
    if (!pending) return false
    this.pending.delete(key)
    this.clearTimer(pending.timer)
    pending.resolve()
    return true
  }

  reject(request, error, { epoch = 0, transactionId = 0 } = {}) {
    const key = `${epoch}/${request}/${transactionId}`
    const pending = this.pending.get(key)
    if (!pending) return false
    this.pending.delete(key)
    this.clearTimer(pending.timer)
    pending.reject(error instanceof Error ? error : new Error(String(error)))
    return true
  }

  clear(error = new Error('Firmware connection closed')) {
    for (const [request, pending] of this.pending) {
      this.pending.delete(request)
      this.clearTimer(pending.timer)
      pending.reject(error)
    }
  }
}

export class SerialLifecycle {
  constructor({ serial, report, onOpened, onClosed }) {
    this.serial = serial
    this.report = report
    this.onOpened = onOpened
    this.onClosed = onClosed
    this.started = false
    this.yielded = false
    this.openedHandler = fingerprint => this.onOpened(fingerprint)
    this.closedHandler = () => this.onClosed()
    this.recoveryTimer = null
  }

  start() {
    if (this.started) return
    this.started = true
    this.yielded = false
    this.serial.setLogLevel('none')
    this.serial.setPortAuthorityLogLevel('none')
    this.serial.PortAuthority.on(this.serial.PortAuthorityEvents.port.opened, this.openedHandler)
    this.serial.PortAuthority.on(this.serial.PortAuthorityEvents.port.closed, this.closedHandler)
    this.serial.startAutoScan()
  }

  stop() {
    if (!this.started) return
    this.cancelRecovery()
    this.serial.stopAutoScan()
    this.closeAuthorityPorts()
    this.serial.PortAuthority.off?.(this.serial.PortAuthorityEvents.port.opened, this.openedHandler)
    this.serial.PortAuthority.off?.(this.serial.PortAuthorityEvents.port.closed, this.closedHandler)
    this.started = false
    this.yielded = false
  }

  yield() {
    if (!this.started || this.yielded) return false
    this.yielded = true
    this.serial.stopAutoScan()
    this.closeAuthorityPorts()
    this.report('serial-yielded')
    return true
  }

  resume() {
    if (!this.started || !this.yielded) return false
    this.yielded = false
    this.serial.startAutoScan()
    this.report('serial-resumed')
    return true
  }

  resetScan(reason, { connected = false, shuttingDown = false } = {}) {
    if (!this.started || this.yielded || connected || shuttingDown) return false
    this.serial.stopAutoScan()
    this.serial.startAutoScan()
    this.report('serial-scan-reset', { reason })
    return true
  }

  scheduleRecovery(reason, { delayMs = 150, beforeReset = () => {} } = {}) {
    if (!this.started || this.yielded || this.recoveryTimer) return false
    this.report('serial-recovery-scheduled', { reason, delayMs })
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      try {
        beforeReset()
        this.resetScan(reason)
      } catch (error) {
        this.report('serial-recovery-error', { reason, message: String(error) })
      }
    }, delayMs)
    this.recoveryTimer.unref?.()
    return true
  }

  cancelRecovery() {
    if (!this.recoveryTimer) return false
    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = null
    return true
  }

  snapshot() {
    return Object.freeze({
      started: this.started,
      yielded: this.yielded,
      recoveryPending: Boolean(this.recoveryTimer),
    })
  }

  closeAuthorityPorts() {
    // New Serial releases own registry cleanup and keepalive cancellation.
    // Keep the fallback only while the Phase 0 installed package is in use.
    if (typeof this.serial.closeAllPorts === 'function') {
      this.serial.closeAllPorts()
      return
    }
    for (const port of Object.values(this.serial.Ports)) port.close()
  }
}

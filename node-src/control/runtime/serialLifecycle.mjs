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
    this.serial.stopAutoScan()
    for (const port of Object.values(this.serial.Ports)) port.close()
    this.serial.PortAuthority.off?.(this.serial.PortAuthorityEvents.port.opened, this.openedHandler)
    this.serial.PortAuthority.off?.(this.serial.PortAuthorityEvents.port.closed, this.closedHandler)
    this.started = false
    this.yielded = false
  }

  yield() {
    if (!this.started || this.yielded) return false
    this.yielded = true
    this.serial.stopAutoScan()
    for (const port of Object.values(this.serial.Ports)) port.close()
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

  snapshot() {
    return Object.freeze({ started: this.started, yielded: this.yielded })
  }
}

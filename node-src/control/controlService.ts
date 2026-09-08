/**
 * Core is the one headless MakeShift engine. Ctrl and the private agent are
 * clients/hosts around it; only Core's singleton owner may open the device.
 */
export type ControlMode = 'window-visible' | 'window-hidden'

export type ControlServiceStatus = Readonly<{
  ownerId: string
  mode: ControlMode
  connected: boolean
  protocol: 'legacy-direct-art' | 'keyed-cache' | 'unknown'
}>

export type ControlClient = Readonly<{
  clientId: string
  mode: ControlMode
}>

export class Core {
  private readonly clients = new Map<string, ControlClient>()
  private status: ControlServiceStatus

  constructor(ownerId: string, mode: ControlMode) {
    this.status = Object.freeze({ ownerId, mode, connected: false, protocol: 'unknown' })
  }

  attach(client: ControlClient): ControlServiceStatus {
    this.clients.set(client.clientId, client)
    return this.status
  }

  detach(clientId: string): void {
    this.clients.delete(clientId)
  }

  snapshot(): ControlServiceStatus {
    return this.status
  }

  // Serial ownership moves here only after the current agent reaches parity.
  publish(status: Partial<Omit<ControlServiceStatus, 'ownerId' | 'mode'>>): void {
    this.status = Object.freeze({ ...this.status, ...status })
  }
}

// Retained temporarily while the legacy Ctrl frontend is reattached to Core.
export { Core as ControlService }

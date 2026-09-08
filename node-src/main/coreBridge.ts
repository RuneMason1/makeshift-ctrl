import { createConnection } from 'node:net'

const CORE_PIPE = '\\\\.\\pipe\\RuneMason.MakeShift.Agent'

export type CoreBridgeStatus = Readonly<{
  attached: boolean
  core: boolean
  connected: boolean
  firmwareUpdateInProgress: boolean
  cueCount: number
  mappingCount: number
  activeCarousel?: Readonly<{ id: string; sessionId: number }> | null
  reason?: string
}>

/** Read-only bridge to the active Core host. Ctrl never opens the serial port. */
export function readCoreStatus(timeoutMs = 750): Promise<CoreBridgeStatus> {
  return new Promise(resolve => {
    let complete = false
    const finish = (status: CoreBridgeStatus) => {
      if (complete) return
      complete = true
      socket.destroy()
      resolve(status)
    }
    const socket = createConnection(CORE_PIPE)
    let response = ''
    socket.setEncoding('utf8')
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => socket.write('status\n'))
    socket.on('data', chunk => { response += chunk })
    socket.on('end', () => {
      try {
        const status = JSON.parse(response)
        finish({ attached: true, core: Boolean(status.core), connected: Boolean(status.connected),
          firmwareUpdateInProgress: Boolean(status.firmwareUpdateInProgress),
          cueCount: Number(status.cueCount) || 0, mappingCount: Number(status.mappingCount) || 0,
          activeCarousel: status.activeCarousel ?? null })
      } catch {
        finish({ attached: false, core: false, connected: false, firmwareUpdateInProgress: false,
          cueCount: 0, mappingCount: 0,
          reason: 'Core returned an invalid status response' })
      }
    })
    socket.on('timeout', () => finish({ attached: false, core: false, connected: false,
      firmwareUpdateInProgress: false, cueCount: 0, mappingCount: 0,
      reason: 'Core status request timed out' }))
    socket.on('error', () => finish({ attached: false, core: false, connected: false,
      firmwareUpdateInProgress: false, cueCount: 0, mappingCount: 0,
      reason: 'Core host is unavailable' }))
  })
}

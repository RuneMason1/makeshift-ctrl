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

type CoreRpcReply<T> = Readonly<{ version: 1, id: string, ok: boolean, result?: T, error?: string }>

function requestCore<T>(method: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(CORE_PIPE)
    let response = ''
    socket.setEncoding('utf8')
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => socket.write(`${JSON.stringify({ version: 1, id: `ctrl-${method}`, method })}\n`))
    socket.on('data', chunk => { response += chunk })
    socket.on('end', () => {
      try {
        const reply = JSON.parse(response) as CoreRpcReply<T>
        if (!reply?.ok) throw new Error(reply?.error ?? 'Core rejected request')
        resolve(reply.result as T)
      } catch (error) { reject(error) }
    })
    socket.on('timeout', () => reject(new Error(`Core ${method} request timed out`)))
    socket.on('error', error => reject(error))
  })
}

/** Firmware update authority lives exclusively in Core. */
export function flashCoreFirmware() {
  return requestCore<{ ok: boolean, reason?: string, message?: string }>('firmware.flash', 150000)
}

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
    socket.on('connect', () => socket.write(`${JSON.stringify({
      version: 1, id: 'ctrl-status', method: 'core.status' })}\n`))
    socket.on('data', chunk => { response += chunk })
    socket.on('end', () => {
      try {
        const reply = JSON.parse(response)
        const status = reply?.ok === true ? reply.result : undefined
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

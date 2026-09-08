/** Firmware-selected artwork protocol. Never send a host-only packet format. */
export type ArtworkProtocol = 'legacy-direct-art' | 'keyed-cache' | 'unknown'

export type FirmwareCapabilities = Readonly<{
  messageTypeCeiling: number
  directArtSlots?: number
  keyedCacheBytes?: number
}>

export function selectArtworkProtocol(capabilities: FirmwareCapabilities): ArtworkProtocol {
  if (capabilities.keyedCacheBytes && capabilities.messageTypeCeiling >= 32) return 'keyed-cache'
  if (capabilities.directArtSlots && capabilities.messageTypeCeiling >= 9) return 'legacy-direct-art'
  return 'unknown'
}

export type DirectArtJob = Readonly<{
  sessionId: number
  itemIndex: number
  slot: number
  artwork: Buffer
}>

export function validateDirectArtJob(job: DirectArtJob, slots: number): boolean {
  return Number.isInteger(job.sessionId) && job.sessionId > 0 &&
    Number.isInteger(job.itemIndex) && job.itemIndex >= 0 &&
    Number.isInteger(job.slot) && job.slot >= 0 && job.slot < slots &&
    job.artwork.length === 80 * 80 * 2
}

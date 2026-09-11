// Canonical host-side representation of the negotiated device protocol.
// Firmware mirrors this fixed binary layout; debug text is telemetry only.
export const PROTOCOL = Object.freeze({
  capabilityPacket: 20,
  cache: Object.freeze({ begin: 27, chunk: 28, commit: 29, bind: 30, version: 4 }),
  collection: Object.freeze({ presentation: 32, maxActionLabelBytes: 24 }),
  capabilityLayout: Object.freeze({
    minLength: 13,
    cacheProtocolOffset: 9,
    featureBitsOffset: 10,
    packetBodyLimitOffset: 11,
    cacheBytesOffset: 13,
    firmwareVersionOffset: 17,
    firmwareVersionLength: 4,
  }),
})

export function parseDeviceCapabilities(packet) {
  const layout = PROTOCOL.capabilityLayout
  if (!packet || packet[0] !== PROTOCOL.capabilityPacket || packet.length < layout.minLength) return null
  const capabilities = {
    runtimeProtocol: packet[1],
    maxComponents: packet[2],
    maxAssets: packet[5],
    cacheSlots: packet[6],
    cacheProtocol: packet[layout.cacheProtocolOffset],
    featureBits: packet[layout.featureBitsOffset],
    packetBodyLimit: (packet[layout.packetBodyLimitOffset] << 8) | packet[layout.packetBodyLimitOffset + 1],
    cacheBytes: packet.readUInt32BE(layout.cacheBytesOffset),
  }
  if (packet.length >= layout.firmwareVersionOffset + layout.firmwareVersionLength) {
    capabilities.firmwareVersion = [...packet.subarray(
      layout.firmwareVersionOffset,
      layout.firmwareVersionOffset + layout.firmwareVersionLength,
    )]
  }
  return Object.freeze(capabilities)
}

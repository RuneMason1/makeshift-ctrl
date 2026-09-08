// Must match mkshft_ctrl::MessageType in the firmware.
// Version 3 adds request-correlated ACKs for begin, commit, and bind.
export const CACHE_PROTOCOL_VERSION = 3
export const CACHE_PACKET_TYPES = Object.freeze({
  begin: 27,
  chunk: 28,
  commit: 29,
  bind: 30,
})

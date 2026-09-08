import { PROTOCOL } from './protocolSchema.mjs'

// Compatibility export for existing Core consumers. New code should import the
// canonical schema directly.
export const CACHE_PROTOCOL_VERSION = PROTOCOL.cache.version
export const CACHE_PACKET_TYPES = Object.freeze({
  begin: PROTOCOL.cache.begin,
  chunk: PROTOCOL.cache.chunk,
  commit: PROTOCOL.cache.commit,
  bind: PROTOCOL.cache.bind,
})

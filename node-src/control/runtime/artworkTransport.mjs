// Providers submit artwork by logical item identity. This adapter selects the
// wire protocol advertised by the connected firmware.
export function createArtworkTransport({ supportsKeyedCache, sendKeyed, sendDirect, onKeyedFailure }) {
  return Object.freeze({
    async send({ port, session, slot, itemIndex, title, artwork, isCurrent }) {
      if (!isCurrent()) return false
      if (supportsKeyedCache()) {
        try {
          return await sendKeyed({ port, session, itemIndex, artwork, isCurrent })
        } catch (error) {
          // A stale or mismatched firmware may advertise keyed cache support
          // but reject its first transaction. Fall back to the known-good
          // direct-art path so one bad negotiation cannot kill a carousel.
          onKeyedFailure?.(error)
          if (!isCurrent()) return false
          return sendDirect({ port, session, slot, itemIndex, title, artwork, isCurrent })
        }
      }
      return sendDirect({ port, session, slot, itemIndex, title, artwork, isCurrent })
    },
  })
}

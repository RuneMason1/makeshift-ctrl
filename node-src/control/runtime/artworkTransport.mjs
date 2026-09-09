// Providers submit artwork by logical item identity. This adapter selects the
// wire protocol advertised by the connected firmware.
export function createArtworkTransport({ supportsKeyedCache, sendKeyed, sendDirect }) {
  return Object.freeze({
    async send({ port, session, slot, itemIndex, title, artwork, isCurrent }) {
      if (!isCurrent()) return false
      if (supportsKeyedCache()) {
        return sendKeyed({ port, session, itemIndex, artwork, isCurrent })
      }
      return sendDirect({ port, session, slot, itemIndex, title, artwork, isCurrent })
    },
  })
}

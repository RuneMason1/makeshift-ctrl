export function createLegacyDirectArtTransport({
  capacity,
  artSize,
  chunkPixels,
  chunkGapMs,
  titleLimit,
  packetTypes,
  report,
}) {
  function boundedTitle(value) {
    let result = ''
    for (const character of String(value ?? '')) {
      if (Buffer.byteLength(result + character, 'utf8') > titleLimit) break
      result += character
    }
    return Buffer.from(result, 'utf8')
  }

  return Object.freeze({
    async send({ port, session, slot, itemIndex, title, artwork, isCurrent }) {
      if (!port || slot < 0 || slot >= capacity || itemIndex < 0 ||
          !Buffer.isBuffer(artwork) || artwork.length !== artSize * artSize * 2 ||
          !isCurrent()) return false

      const startedAt = performance.now()
      const safeTitle = boundedTitle(title)
      const begin = Buffer.allocUnsafe(7 + safeTitle.length)
      begin[0] = slot; begin[1] = itemIndex
      begin.writeUInt16BE(artSize, 2); begin.writeUInt16BE(artSize, 4)
      begin[6] = safeTitle.length; safeTitle.copy(begin, 7)
      if (!port.sendPacket(packetTypes.begin, begin)) return false
      report('artwork-transfer-begin', {
        id: session.id, sessionId: session.wireSessionId, itemIndex, slot,
        bytes: artwork.length,
      })

      for (let offset = 0; offset < artSize * artSize; offset += chunkPixels) {
        if (!isCurrent()) return false
        const count = Math.min(chunkPixels, artSize * artSize - offset)
        const chunk = Buffer.allocUnsafe(4 + count * 2)
        chunk.writeUInt32BE(offset, 0)
        artwork.copy(chunk, 4, offset * 2, (offset + count) * 2)
        if (!port.sendPacket(packetTypes.chunk, chunk)) return false
        await new Promise(resolve => setTimeout(resolve, chunkGapMs))
      }

      const committed = isCurrent() && port.sendPacket(packetTypes.commit)
      report('artwork-transfer-finished', {
        id: session.id, sessionId: session.wireSessionId, itemIndex, slot,
        bytes: artwork.length, committed, durationMs: Math.round(performance.now() - startedAt),
      })
      return committed
    },
  })
}

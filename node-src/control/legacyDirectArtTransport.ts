import type { CarouselItem, CarouselTransport } from './carouselCoordinator'

const GAME_CARD_BEGIN = 7
const GAME_ART_CHUNK = 8
const GAME_CARD_COMMIT = 9
const GAME_LIST_BEGIN = 11
const GAME_LIST_ITEM = 12
const GAME_LIST_COMMIT = 13
const COLLECTION_INPUT_BINDING = 25

const ART_WIDTH = 80
const ART_HEIGHT = 80

export type PacketWriter = Readonly<{
  sendPacket: (messageType: number, body?: Buffer) => boolean
}>

export type DirectArtwork = Readonly<{
  slot: number
  itemIndex: number
  title: string
  rgb565: Buffer
}>

/**
 * Exact adapter for firmware through MessageType 26. This intentionally does
 * not send cache/session packets 27-32, which that firmware cannot receive.
 */
export class LegacyDirectArtTransport implements CarouselTransport {
  constructor(
    private readonly writer: PacketWriter,
    private readonly chunkPixels = 118,
    private readonly interChunkDelayMs = 3,
  ) {}

  async commitList(items: readonly CarouselItem[]): Promise<boolean> {
    if (items.length < 1 || items.length > 64 ||
        !this.writer.sendPacket(GAME_LIST_BEGIN, Buffer.from([items.length]))) return false
    for (const item of items) {
      const itemId = Buffer.from(item.itemId, 'ascii')
      const title = this.boundedTitle(item.title)
      const body = Buffer.allocUnsafe(2 + itemId.length + title.length)
      body[0] = itemId.length
      body[1] = title.length
      itemId.copy(body, 2)
      title.copy(body, 2 + itemId.length)
      if (!this.writer.sendPacket(GAME_LIST_ITEM, body)) return false
    }
    return this.writer.sendPacket(GAME_LIST_COMMIT)
  }

  async bindInput(dial: number, button: number): Promise<boolean> {
    return this.writer.sendPacket(COLLECTION_INPUT_BINDING, Buffer.from([dial, button]))
  }

  async sendArtwork(artwork: DirectArtwork): Promise<boolean> {
    if (artwork.slot < 0 || artwork.slot >= 7 || artwork.itemIndex < 0 ||
        artwork.rgb565.length !== ART_WIDTH * ART_HEIGHT * 2) return false
    const title = this.boundedTitle(artwork.title)
    const begin = Buffer.allocUnsafe(7 + title.length)
    begin[0] = artwork.slot
    begin[1] = artwork.itemIndex
    begin.writeUInt16BE(ART_WIDTH, 2)
    begin.writeUInt16BE(ART_HEIGHT, 4)
    begin[6] = title.length
    title.copy(begin, 7)
    if (!this.writer.sendPacket(GAME_CARD_BEGIN, begin)) return false

    const pixels = ART_WIDTH * ART_HEIGHT
    for (let offset = 0; offset < pixels; offset += this.chunkPixels) {
      const count = Math.min(this.chunkPixels, pixels - offset)
      const chunk = Buffer.allocUnsafe(4 + count * 2)
      chunk.writeUInt32BE(offset, 0)
      artwork.rgb565.copy(chunk, 4, offset * 2, (offset + count) * 2)
      if (!this.writer.sendPacket(GAME_ART_CHUNK, chunk)) return false
      if (this.interChunkDelayMs > 0) await this.delay(this.interChunkDelayMs)
    }
    return this.writer.sendPacket(GAME_CARD_COMMIT)
  }

  private boundedTitle(value: string): Buffer {
    return Buffer.from(value, 'utf8').subarray(0, 48)
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }
}

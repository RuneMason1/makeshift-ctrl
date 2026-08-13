import { app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { MakeShiftPort, PacketType } from '@eos-makeshift/serial'

export type CollectionItem = {
  itemId: string
  title: string
  rank: number
  artworkPath: string
}

export type CollectionRuntimeOptions = {
  getPort: () => MakeShiftPort | undefined
  activateItem: (item: CollectionItem) => Promise<void>
  messagePrefix?: string
  dialEventPrefix?: string
  localItemLimit?: number
}

const ART_SIZE = 80
const CHUNK_PIXELS = 118
const TITLE_LIMIT_BYTES = 48
const COLLECTION_TIMEOUT_MS = 12_000
const ARTWORK_SETTLE_MS = 90

// Generic names over the stable legacy packet values. This bridge can use the
// serial package's PacketAlias export after ctrl updates that dependency build.
const CollectionPacket = {
  CardBegin: PacketType.GAME_CARD_BEGIN,
  ArtChunk: PacketType.GAME_ART_CHUNK,
  CardCommit: PacketType.GAME_CARD_COMMIT,
  ListBegin: PacketType.GAME_LIST_BEGIN,
  ListItem: PacketType.GAME_LIST_ITEM,
  ListCommit: PacketType.GAME_LIST_COMMIT,
} as const

function boundedTitle(title: string): Buffer {
  let result = ''
  for (const character of title) {
    if (Buffer.byteLength(result + character, 'utf8') > TITLE_LIMIT_BYTES) break
    result += character
  }
  return Buffer.from(result, 'utf8')
}

function rgb565Artwork(path: string): Buffer {
  const result = Buffer.allocUnsafe(ART_SIZE * ART_SIZE * 2)
  const source = nativeImage.createFromPath(path)
  if (source.isEmpty()) {
    for (let index = 0; index < ART_SIZE * ART_SIZE; ++index) {
      const x = index % ART_SIZE
      const y = Math.floor(index / ART_SIZE)
      const red = 20 + Math.floor((x / ART_SIZE) * 35)
      const green = 38 + Math.floor((y / ART_SIZE) * 45)
      const blue = 52
      result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), index * 2)
    }
    return result
  }

  const size = source.getSize()
  const scale = Math.max(ART_SIZE / size.width, ART_SIZE / size.height)
  const resized = source.resize({
    width: Math.ceil(size.width * scale),
    height: Math.ceil(size.height * scale),
    quality: 'best',
  })
  const resizedSize = resized.getSize()
  const bitmap = resized.crop({
    x: Math.floor((resizedSize.width - ART_SIZE) / 2),
    y: Math.floor((resizedSize.height - ART_SIZE) / 2),
    width: ART_SIZE,
    height: ART_SIZE,
  }).toBitmap()
  for (let index = 0; index < ART_SIZE * ART_SIZE; ++index) {
    const blue = bitmap[index * 4]
    const green = bitmap[index * 4 + 1]
    const red = bitmap[index * 4 + 2]
    result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), index * 2)
  }
  return result
}

export class CollectionRuntime {
  private items: CollectionItem[] = []
  private selectedIndex = 0
  private visible = false
  private transferId = 0
  private hideTimer?: NodeJS.Timeout
  private artworkTimer?: NodeJS.Timeout
  private artworkCache = new Map<string, Promise<Buffer>>()
  private showArtwork = true
  private readonly messagePrefix: string
  private readonly dialEventPrefix: string
  private readonly localItemLimit: number

  constructor(private readonly options: CollectionRuntimeOptions) {
    this.messagePrefix = options.messagePrefix ?? 'GAME_LAUNCH:'
    this.dialEventPrefix = options.dialEventPrefix ?? 'sensor-0'
    this.localItemLimit = options.localItemLimit ?? 64
  }

  setItems(items: CollectionItem[]): void {
    this.items = [...items].sort((left, right) =>
      right.rank - left.rank || left.title.localeCompare(right.title))
    this.selectedIndex = 0
    this.syncToDevice()
  }

  setArtworkEnabled(enabled: boolean): void {
    this.showArtwork = enabled
    if (!enabled) this.syncToDevice()
  }

  syncToDevice(port = this.options.getPort()): void {
    if (this.showArtwork || !port || this.items.length === 0) return
    const items = this.items.slice(0, this.localItemLimit)
    if (!port.sendPacket(CollectionPacket.ListBegin, Buffer.from([items.length]))) return
    for (const collectionItem of items) {
      const itemId = Buffer.from(collectionItem.itemId, 'ascii')
      const title = boundedTitle(collectionItem.title)
      const payload = Buffer.allocUnsafe(2 + itemId.length + title.length)
      payload[0] = itemId.length
      payload[1] = title.length
      itemId.copy(payload, 2)
      title.copy(payload, 2 + itemId.length)
      if (!port.sendPacket(CollectionPacket.ListItem, payload)) return
    }
    port.sendPacket(CollectionPacket.ListCommit)
  }

  async handleDeviceMessage(message: string): Promise<void> {
    if (!message.startsWith(this.messagePrefix)) return
    const itemId = message.slice(this.messagePrefix.length).trim()
    const item = this.items.find(candidate => candidate.itemId === itemId)
    if (item) await this.options.activateItem(item)
  }

  async handleEvent(eventName: string, showArtwork = true): Promise<boolean> {
    const incrementEvent = `${this.dialEventPrefix}-dial-increment`
    const decrementEvent = `${this.dialEventPrefix}-dial-decrement`
    if (eventName === incrementEvent || eventName === decrementEvent) {
      if (this.items.length === 0) return false
      if (this.visible) {
        const direction = eventName === incrementEvent ? 1 : -1
        this.selectedIndex = (this.selectedIndex + direction + this.items.length) % this.items.length
      } else {
        this.selectedIndex = 0
        this.visible = true
      }
      this.showSelectedItem(showArtwork)
      return true
    }

    if (eventName === `${this.dialEventPrefix}-button-pressed` && this.visible) {
      await this.options.activateItem(this.items[this.selectedIndex])
      this.returnHome()
      return true
    }
    return false
  }

  private showSelectedItem(showArtwork: boolean): void {
    const port = this.options.getPort()
    if (!port) return
    const transferId = ++this.transferId
    const item = this.items[this.selectedIndex]
    const title = boundedTitle(item.title)
    const begin = Buffer.allocUnsafe(5 + title.length)
    begin.writeUInt16BE(showArtwork ? ART_SIZE : 0, 0)
    begin.writeUInt16BE(showArtwork ? ART_SIZE : 0, 2)
    begin[4] = title.length
    title.copy(begin, 5)
    if (!port.sendPacket(CollectionPacket.CardBegin, begin)) return

    if (this.artworkTimer) clearTimeout(this.artworkTimer)
    this.artworkTimer = undefined
    if (showArtwork) {
      this.artworkTimer = setTimeout(() => void this.sendArtwork(item, transferId), ARTWORK_SETTLE_MS)
      this.artworkTimer.unref()
    }
    this.resetHideTimer()
  }

  private async sendArtwork(item: CollectionItem, transferId: number): Promise<void> {
    const port = this.options.getPort()
    if (!port || transferId !== this.transferId) return
    const artwork = await this.cachedArtwork(item)
    if (transferId !== this.transferId) return

    for (let pixelOffset = 0; pixelOffset < ART_SIZE * ART_SIZE; pixelOffset += CHUNK_PIXELS) {
      if (transferId !== this.transferId) return
      const pixelCount = Math.min(CHUNK_PIXELS, ART_SIZE * ART_SIZE - pixelOffset)
      const chunk = Buffer.allocUnsafe(4 + pixelCount * 2)
      chunk.writeUInt32BE(pixelOffset, 0)
      artwork.copy(chunk, 4, pixelOffset * 2, (pixelOffset + pixelCount) * 2)
      if (!port.sendPacket(CollectionPacket.ArtChunk, chunk)) return
      if (pixelOffset % (CHUNK_PIXELS * 4) === 0) await new Promise(resolve => setImmediate(resolve))
    }
    if (transferId === this.transferId) port.sendPacket(CollectionPacket.CardCommit)
  }

  private cachedArtwork(item: CollectionItem): Promise<Buffer> {
    const existing = this.artworkCache.get(item.itemId)
    if (existing) return existing
    const pending = (async () => {
      const cacheRoot = join(app.getPath('userData'), 'collection-art-cache')
      const safeId = item.itemId.replaceAll(/[^a-z0-9_.-]/gi, '_')
      const cachePath = join(cacheRoot, `${safeId}-${ART_SIZE}.rgb565`)
      if (existsSync(cachePath)) {
        const cached = await readFile(cachePath)
        if (cached.length === ART_SIZE * ART_SIZE * 2) return cached
      }
      const converted = rgb565Artwork(item.artworkPath)
      await mkdir(cacheRoot, { recursive: true })
      await writeFile(cachePath, converted)
      return converted
    })()
    this.artworkCache.set(item.itemId, pending)
    return pending
  }

  private resetHideTimer(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.returnHome(), COLLECTION_TIMEOUT_MS)
    this.hideTimer.unref()
  }

  private returnHome(): void {
    ++this.transferId
    this.visible = false
    if (this.hideTimer) clearTimeout(this.hideTimer)
    if (this.artworkTimer) clearTimeout(this.artworkTimer)
    this.options.getPort()?.sendPacket(PacketType.SCREEN_HOME)
  }
}

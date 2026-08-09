import { app, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { MakeShiftPort, PacketType } from '@eos-makeshift/serial'

type Game = { appId: string, name: string, lastPlayed: number, artworkPath: string }

const ART_SIZE = 112
const CHUNK_PIXELS = 118
const TITLE_LIMIT_BYTES = 48
const CAROUSEL_TIMEOUT_MS = 12_000

function capture(text: string, key: string): string {
  return new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)?.[1] ?? ''
}

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
  const cropped = resized.crop({
    x: Math.floor((resizedSize.width - ART_SIZE) / 2),
    y: Math.floor((resizedSize.height - ART_SIZE) / 2),
    width: ART_SIZE,
    height: ART_SIZE,
  })
  const bitmap = cropped.toBitmap()
  for (let index = 0; index < ART_SIZE * ART_SIZE; ++index) {
    const blue = bitmap[index * 4]
    const green = bitmap[index * 4 + 1]
    const red = bitmap[index * 4 + 2]
    result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), index * 2)
  }
  return result
}

async function discoverSteamGames(): Promise<Game[]> {
  const steamRoot = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam')
  const libraryFile = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  const libraries = new Set<string>([steamRoot])
  if (existsSync(libraryFile)) {
    const contents = await readFile(libraryFile, 'utf8')
    for (const match of contents.matchAll(/"path"\s+"([^"]+)"/gi)) {
      libraries.add(match[1].replaceAll('\\\\', '\\'))
    }
  }

  const games: Game[] = []
  for (const library of libraries) {
    const steamApps = join(library, 'steamapps')
    if (!existsSync(steamApps)) continue
    for (const file of await readdir(steamApps)) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
      const manifest = await readFile(join(steamApps, file), 'utf8')
      const appId = capture(manifest, 'appid')
      const name = capture(manifest, 'name')
      if (!appId || !name || capture(manifest, 'StateFlags') !== '4') continue
      const artworkPath = await findSteamArtwork(
        join(steamRoot, 'appcache', 'librarycache', appId),
      )
      games.push({
        appId,
        name,
        lastPlayed: Number(capture(manifest, 'LastPlayed')) || 0,
        artworkPath,
      })
    }
  }
  return games.sort((left, right) =>
    right.lastPlayed - left.lastPlayed || left.name.localeCompare(right.name))
}

async function findSteamArtwork(cacheFolder: string): Promise<string> {
  if (!existsSync(cacheFolder)) return ''
  const preferredNames = ['library_600x900.jpg', 'library_header.jpg', 'logo.png']
  for (const name of preferredNames) {
    const candidate = join(cacheFolder, name)
    if (existsSync(candidate)) return candidate
  }

  const candidates: { path: string, size: number }[] = []
  for (const file of await readdir(cacheFolder)) {
    if (!/\.(jpg|jpeg|png)$/i.test(file)) continue
    const path = join(cacheFolder, file)
    candidates.push({ path, size: (await stat(path)).size })
  }
  candidates.sort((left, right) => right.size - left.size)
  return candidates[0]?.path ?? ''
}

export class GameLauncher {
  private games: Game[] = []
  private selectedIndex = 0
  private visible = false
  private transferId = 0
  private hideTimer?: NodeJS.Timeout
  private artworkCache = new Map<string, Promise<Buffer>>()

  constructor(private readonly getPort: () => MakeShiftPort | undefined) {}

  async initialize(): Promise<void> {
    this.games = await discoverSteamGames()
    void this.prewarmArtworkCache()
  }

  async handleEvent(eventName: string): Promise<boolean> {
    if (eventName === 'sensor-0-dial-increment' || eventName === 'sensor-0-dial-decrement') {
      if (this.games.length === 0) await this.initialize()
      if (this.games.length === 0) return true
      if (this.visible) {
        // Preserve hardware direction all the way through selection. Clockwise
        // moves newer-to-older; counterclockwise walks back toward newer games.
        const direction = eventName.endsWith('increment') ? 1 : -1
        this.selectedIndex = (this.selectedIndex + direction + this.games.length) % this.games.length
      } else {
        this.selectedIndex = 0
        this.visible = true
      }
      void this.showSelectedGame()
      return true
    }

    if (eventName === 'sensor-0-button-pressed' && this.visible) {
      const game = this.games[this.selectedIndex]
      await shell.openExternal(`steam://run/${game.appId}`)
      this.returnHome()
      return true
    }
    return false
  }

  private async showSelectedGame(): Promise<void> {
    const port = this.getPort()
    if (!port) return
    const transferId = ++this.transferId
    const game = this.games[this.selectedIndex]
    const artwork = await this.cachedArtwork(game)
    if (transferId !== this.transferId) return
    const title = boundedTitle(game.name)
    const begin = Buffer.allocUnsafe(5 + title.length)
    begin.writeUInt16BE(ART_SIZE, 0)
    begin.writeUInt16BE(ART_SIZE, 2)
    begin[4] = title.length
    title.copy(begin, 5)
    if (!port.sendPacket(PacketType.GAME_CARD_BEGIN, begin)) return

    for (let pixelOffset = 0; pixelOffset < ART_SIZE * ART_SIZE; pixelOffset += CHUNK_PIXELS) {
      if (transferId !== this.transferId) return
      const pixelCount = Math.min(CHUNK_PIXELS, ART_SIZE * ART_SIZE - pixelOffset)
      const chunk = Buffer.allocUnsafe(4 + pixelCount * 2)
      chunk.writeUInt32BE(pixelOffset, 0)
      artwork.copy(chunk, 4, pixelOffset * 2, (pixelOffset + pixelCount) * 2)
      if (!port.sendPacket(PacketType.GAME_ART_CHUNK, chunk)) return
      if (pixelOffset % (CHUNK_PIXELS * 8) === 0) {
        await new Promise(resolve => setImmediate(resolve))
      }
    }
    if (transferId !== this.transferId) return
    port.sendPacket(PacketType.GAME_CARD_COMMIT)
    this.resetHideTimer()
  }

  private cachedArtwork(game: Game): Promise<Buffer> {
    const existing = this.artworkCache.get(game.appId)
    if (existing) return existing

    const pending = (async () => {
      const cacheRoot = join(app.getPath('userData'), 'game-art-cache')
      const cachePath = join(cacheRoot, `${game.appId}-${ART_SIZE}.rgb565`)
      if (existsSync(cachePath)) {
        const cached = await readFile(cachePath)
        if (cached.length === ART_SIZE * ART_SIZE * 2) return cached
      }

      const converted = rgb565Artwork(game.artworkPath)
      await mkdir(cacheRoot, { recursive: true })
      await writeFile(cachePath, converted)
      return converted
    })()
    this.artworkCache.set(game.appId, pending)
    return pending
  }

  private async prewarmArtworkCache(): Promise<void> {
    for (const game of this.games) {
      await this.cachedArtwork(game)
    }
  }

  private resetHideTimer(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.returnHome(), CAROUSEL_TIMEOUT_MS)
    this.hideTimer.unref()
  }

  private returnHome(): void {
    ++this.transferId
    this.visible = false
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.getPort()?.sendPacket(PacketType.SCREEN_HOME)
  }
}

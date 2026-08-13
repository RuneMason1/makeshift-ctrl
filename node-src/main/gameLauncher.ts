import { shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { MakeShiftPort } from '@eos-makeshift/serial'

import { CollectionItem, CollectionRuntime } from './collectionRuntime'

type Game = { appId: string, name: string, lastPlayed: number, artworkPath: string }
export type { CollectionItem } from './collectionRuntime'

function capture(text: string, key: string): string {
  return new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)?.[1] ?? ''
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
      games.push({
        appId,
        name,
        lastPlayed: Number(capture(manifest, 'LastPlayed')) || 0,
        artworkPath: await findSteamArtwork(join(steamRoot, 'appcache', 'librarycache', appId)),
      })
    }
  }
  return games.sort((left, right) =>
    right.lastPlayed - left.lastPlayed || left.name.localeCompare(right.name))
}

async function findSteamArtwork(cacheFolder: string): Promise<string> {
  if (!existsSync(cacheFolder)) return ''
  for (const name of ['library_600x900.jpg', 'library_header.jpg', 'logo.png']) {
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
  readonly id = 'steam'
  private games: Game[] = []
  private readonly runtime: CollectionRuntime

  constructor(getPort: () => MakeShiftPort | undefined) {
    this.runtime = new CollectionRuntime({
      getPort,
      activateItem: item => shell.openExternal(`steam://run/${item.itemId}`).then(() => undefined),
    })
  }

  async initialize(): Promise<void> {
    this.games = await discoverSteamGames()
    this.runtime.setItems(this.games.map(game => ({
      itemId: game.appId,
      title: game.name,
      rank: game.lastPlayed,
      artworkPath: game.artworkPath,
    } satisfies CollectionItem)))
  }

  setArtworkEnabled(enabled: boolean): void {
    this.runtime.setArtworkEnabled(enabled)
  }

  syncToDevice(port?: MakeShiftPort): void {
    this.runtime.syncToDevice(port)
  }

  async handleDeviceMessage(message: string): Promise<void> {
    if (!message.startsWith('GAME_LAUNCH:')) return
    await this.ensureInitialized()
    await this.runtime.handleDeviceMessage(message)
  }

  async handleEvent(eventName: string, showArtwork = true): Promise<boolean> {
    await this.ensureInitialized()
    if (this.games.length === 0 &&
        (eventName === 'sensor-0-dial-increment' || eventName === 'sensor-0-dial-decrement')) {
      return true
    }
    return this.runtime.handleEvent(eventName, showArtwork)
  }

  private async ensureInitialized(): Promise<void> {
    if (this.games.length === 0) await this.initialize()
  }
}

// Compatibility name for existing cues. Steam is now one provider backed by
// the same collection runtime available to other integrations.
export { GameLauncher as SteamCollectionProvider }

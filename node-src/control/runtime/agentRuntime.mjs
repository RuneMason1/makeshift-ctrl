import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import readline from 'node:readline'
import { ArtworkAssetStore, ArtworkTransferScheduler, LegacyArtworkResidency } from './artworkCore.mjs'
import { createArtworkTransport } from './artworkTransport.mjs'
import { createLegacyDirectArtTransport } from './legacyDirectArtTransport.mjs'
import { CarouselSessionCoordinator } from './carouselSessionCoordinator.mjs'
import { CACHE_PACKET_TYPES, CACHE_PROTOCOL_VERSION } from './cacheProtocol.mjs'
import { PROTOCOL, parseDeviceCapabilities } from './protocolSchema.mjs'
import { ProtocolAckTracker } from './protocolAckTracker.mjs'
import { WireScheduler } from './wireScheduler.mjs'
import { SerialLifecycle } from './serialLifecycle.mjs'
import { RelativeSeek } from './relativeSeek.mjs'

const PIPE_NAME = process.env.MAKESHIFT_CORE_PIPE_NAME ?? '\\\\.\\pipe\\RuneMason.MakeShift.Agent'
const GAME_LIST_BEGIN = 11
const GAME_LIST_ITEM = 12
const GAME_LIST_COMMIT = 13
const GAME_CARD_BEGIN = 7
const GAME_ART_CHUNK = 8
const GAME_CARD_COMMIT = 9
const GOXLR_STATUS = 14
const NOW_PLAYING = 15
const ACTION_GLYPH = 16
const ASSET_BEGIN = 21
const ASSET_CHUNK = 22
const ASSET_COMMIT = 23
const DEVICE_VISUALS = 24
const COLLECTION_INPUT_BINDING = 25
const STATUS_BADGE = 26
const SCREEN_ZONE = 27
const LED_EFFECT = 28
const COLLECTION_PRESENTATION = PROTOCOL.collection.presentation
const CACHE_FILE_BEGIN = CACHE_PACKET_TYPES.begin
const CACHE_FILE_CHUNK = CACHE_PACKET_TYPES.chunk
const CACHE_FILE_COMMIT = CACHE_PACKET_TYPES.commit
const CACHE_FILE_BIND = CACHE_PACKET_TYPES.bind
const RUNTIME_CAPABILITIES = 20
const SCREEN_ZONES = Object.freeze({
  fullscreen: 0,
  'bottom-left': 1,
  'bottom-right': 2,
  'upper-text': 3,
  center: 4,
  'status-bar': 5,
  'left-rail': 6,
  'right-rail': 7,
  'bottom-center-left': 8,
  'bottom-center-right': 9,
})
const SCREEN_ZONE_ALIASES = new Map([
  ['special', 'fullscreen'], ['full-screen', 'fullscreen'],
  ['lower-left', 'bottom-left'], ['lower-right', 'bottom-right'],
  ['bottom-inner-left', 'bottom-center-left'],
  ['bottom-inner-right', 'bottom-center-right'],
  ['now-playing', 'upper-text'], ['upper', 'upper-text'],
  ['center-glyph', 'center'], ['overlay', 'center'],
  ['connection', 'status-bar'], ['top-bar', 'status-bar'],
])
const SCREEN_ZONE_CAPABILITIES = Object.freeze({
  fullscreen: Object.freeze(['collection']),
  'bottom-left': Object.freeze(['status', 'clear']),
  'bottom-right': Object.freeze(['status', 'clear']),
  'bottom-center-left': Object.freeze(['status', 'clear']),
  'bottom-center-right': Object.freeze(['status', 'clear']),
  'upper-text': Object.freeze(['text', 'clear']),
  center: Object.freeze(['asset', 'clear']),
  'left-rail': Object.freeze(['asset', 'clear']),
  'right-rail': Object.freeze(['asset', 'clear']),
  'status-bar': Object.freeze(['system-state', 'preference-colors']),
})
const ACTION_GLYPHS = new Map([
  ['previous', 1], ['play-pause', 2], ['next', 3],
])
const OVERLAY_GLYPHS = new Map([
  ['previous', 1], ['play-pause', 2], ['next', 3],
  ['mute', 4], ['unmute', 5],
  ['media.previous', 1], ['media.play-pause', 2], ['media.next', 3],
  ['media.mute', 4], ['media.unmute', 5],
])
const GLYPH_SIZE = 32
const VECTOR_GLYPH_SIZE = 112

function makeGlyph(draw) {
  const data = Buffer.alloc((GLYPH_SIZE * GLYPH_SIZE) / 8)
  const set = (x, y) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= GLYPH_SIZE || y < 0 || y >= GLYPH_SIZE) return
    const bit = y * GLYPH_SIZE + x
    data[bit >> 3] |= 0x80 >> (bit & 7)
  }
  draw(set)
  return data
}

function glyphLine(set, x0, y0, x1, y1, width = 2) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let step = 0; step <= steps; ++step) {
    const x = Math.round(x0 + (x1 - x0) * step / Math.max(1, steps))
    const y = Math.round(y0 + (y1 - y0) * step / Math.max(1, steps))
    for (let oy = -Math.floor(width / 2); oy <= Math.floor(width / 2); ++oy) {
      for (let ox = -Math.floor(width / 2); ox <= Math.floor(width / 2); ++ox) set(x + ox, y + oy)
    }
  }
}

function glyphArc(set, cx, cy, radius, start, end, width = 2) {
  for (let angle = start; angle <= end; angle += 0.035) {
    glyphLine(set, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius,
      cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, width)
  }
}

function speakerGlyph(muted) {
  return makeGlyph(set => {
    glyphArc(set, 16, 16, 14, 0, Math.PI * 2, 1)
    glyphLine(set, 5, 13, 9, 13, 2); glyphLine(set, 5, 13, 5, 20, 2)
    glyphLine(set, 5, 20, 9, 20, 2); glyphLine(set, 9, 13, 15, 8, 2)
    glyphLine(set, 15, 8, 15, 24, 2); glyphLine(set, 15, 24, 9, 20, 2)
    glyphArc(set, 14, 16, 6, -0.9, 0.9, 1)
    glyphArc(set, 14, 16, 10, -0.9, 0.9, 1)
    if (muted) glyphLine(set, 8, 7, 25, 25, 2)
  })
}

function vectorArc(cx, cy, radius, startDegrees, endDegrees, width = 2) {
  return [4, cx, cy, radius, Math.round(startDegrees / 2) & 0xff,
    Math.round(endDegrees / 2) & 0xff, width]
}

function speakerVectorGlyph(muted) {
  const commands = [
    // Match the filled transport glyph style instead of using an outline ring.
    // A conventional speaker cabinet overlaps the cone at its center point.
    1, 14, 46, 31, 20,
    2, 35, 56, 68, 31, 68, 81,
    ...vectorArc(64, 56, 18, -54, 54, 2),
    ...vectorArc(64, 56, 31, -54, 54, 2),
  ]
  if (muted) commands.push(3, 20, 20, 92, 92, 4)
  commands.push(0)
  return Buffer.from(commands)
}

let RUNTIME_ASSETS = new Map()
const GAME_LIMIT = 64
const PLEX_COLLECTION_LIMIT = 8
const TITLE_LIMIT = 48
const ART_SIZE = 80
const ART_CACHE_VERSION = 'fit-v2'
const ARTWORK_SETTLE_MS = 140
const CHUNK_PIXELS = 118
const ARTWORK_CHUNK_GAP_MS = 3
// The host wrapper guarantees 240-byte packet bodies. Keep the cache offset
// plus payload under that known-good limit.
const CACHE_CHUNK_BYTES = 224
// PacketSerial does not provide write back-pressure. A short per-frame gap
// keeps the Teensy's packet parser ordered while retaining sub-second art.
const CACHE_PACKET_GAP_MS = 3
const BUTTON_LONG_PRESS_MS = 650
const INITIAL_SYNC_DELAY_MS = 300
const INITIAL_PACKET_GAP_MS = 4
const GOXLR_CLIENT = 'C:\\Program Files\\GoXLR Utility\\goxlr-client.exe'
const PLEX_TITLE_LOOKUP_TTL_MS = 5 * 60 * 1000
const GOXLR_CHANNELS = [
  ['music', 'Music'], ['line-in', 'Chromecast'],
  ['game', 'Game'], ['system', 'System'], ['chat', 'Chat'],
]

const args = new Map()
for (let index = 2; index < process.argv.length - 1; index += 2) {
  args.set(process.argv[index], process.argv[index + 1])
}

const ctrlRoot = args.get('--ctrl-root') ?? process.env.MAKESHIFT_CTRL_ROOT
if (!ctrlRoot) throw new Error('Missing --ctrl-root')

const coreHostRoot = process.env.MAKESHIFT_CORE_HOST_ROOT ?? dirname(fileURLToPath(import.meta.url))
const materialGlyphCatalogPath = join(coreHostRoot,
  'materialGlyphCatalog.json')
try {
  const catalog = JSON.parse(readFileSync(materialGlyphCatalogPath, 'utf8'))
  RUNTIME_ASSETS = new Map((catalog.assets ?? []).map(asset => [asset.name, {
    ...asset,
    data: Buffer.from(asset.data, 'base64'),
  }]))
} catch (error) {
  throw new Error(`Material glyph catalog unavailable: ${error.message}`)
}

const appData = join(process.env.APPDATA, 'makeshift-ctrl')
const deviceFileCacheRoot = join(appData, 'device-file-cache')
const cuesRoot = join(appData, 'cues')
const cuePluginRoot = join(appData, 'plugins')
const configPath = join(appData, 'config.json')
const homeAssistantConfigPath = join(appData, 'home-assistant.private.json')
const logRoot = join(appData, 'logs')
const nowPlayingStatePath = join(process.env.LOCALAPPDATA, 'RuneMason', 'SystrayWidget', 'now-playing.json')
const mediaSourcePath = join(process.env.APPDATA, 'makeshift-ctrl', 'media-source.json')
let mediaSourceMode = (() => {
  try {
    const value = JSON.parse(readFileSync(mediaSourcePath, 'utf8')).mode
    return ['auto', 'local', 'chromecast'].includes(value) ? value : 'auto'
  } catch { return 'auto' }
})()

let mediaSourceNoticeUntil = 0
let mediaSourceNoticeTimer
let indicatorSupported = false
function syncMediaSourceIndicator() {
  if (!indicatorSupported || !activePort) return
  const rgb = { auto: [80, 36, 0], local: [0, 32, 100], chromecast: [0, 70, 18] }[mediaSourceMode]
  activePort.sendPacket(31, Buffer.from([8, 1, ...rgb]))
}
async function cycleMediaSource() {
  const modes = ['auto', 'local', 'chromecast']
  mediaSourceMode = modes[(modes.indexOf(mediaSourceMode) + 1) % modes.length]
  relativeSeek.clear()
  await writeFile(mediaSourcePath, JSON.stringify({ mode: mediaSourceMode }))
  syncMediaSourceIndicator()
  mediaSourceNoticeUntil = Date.now() + 2000
  clearTimeout(mediaSourceNoticeTimer)
  mediaSourceNoticeTimer = setTimeout(() => {
    mediaSourceNoticeUntil = 0
    lastNowPlaying = ''
    publishNowPlaying()
  }, 2000)
  mediaSourceNoticeTimer.unref()
  lastNowPlaying = ''
  publishNowPlaying()
  report('media-source-selected', { mode: mediaSourceMode })
  return mediaSourceMode
}
const controlSelectionStatePath = join(
  process.env.LOCALAPPDATA, 'RuneMason', 'SystrayWidget', 'makeshift-selections.json')
const mediaSessionReaderPath = join(coreHostRoot, 'media-session-reader.ps1')
const serialEntry = join(ctrlRoot, 'node_modules', '@eos-makeshift', 'serial', 'lib', 'makeshift-serial.mjs')
if (!existsSync(serialEntry)) throw new Error(`MakeShift serial runtime not found: ${serialEntry}`)
const firmwareHex = process.env.MAKESHIFT_FIRMWARE_HEX ??
  join(dirname(ctrlRoot), 'makeshift-firmware', 'build', '0.0.3', 'mkshft', 'firmware.hex')
const firmwareRoot = dirname(dirname(dirname(dirname(firmwareHex))))
const platformioExecutable = process.env.MAKESHIFT_PLATFORMIO ?? [
  join(process.env.APPDATA, 'Python', 'Python313', 'Scripts', 'platformio.exe'),
  join(process.env.APPDATA, 'Python', 'Python312', 'Scripts', 'platformio.exe'),
].find(existsSync) ?? 'platformio.exe'
const teensyLoader = process.env.MAKESHIFT_TEENSY_LOADER ??
  join(process.env.USERPROFILE, '.platformio', 'packages', 'tool-teensy',
    'teensy_loader_cli.exe')
const teensyPostCompile = join(dirname(teensyLoader), 'teensy_post_compile.exe')
const firmwareArchiveRoot = join(dirname(firmwareRoot), '.codex', 'checkpoints')
const windowsRecoveryScript = join(coreHostRoot,
  'windows-recovery.ps1')

const serial = await import(pathToFileURL(serialEntry).href)
const requireFromCtrl = createRequire(join(ctrlRoot, 'package.json'))
let Jimp
let Nut
let Xml2js

let mappings = new Map()
let modules = new Map()
const cuePluginRegistry = new Map()
let activePort
let activeDeviceFingerprint = null
let games = []
let shuttingDown = false
let coreStarted = false
let coreInput
let profileReloadTimer
let carouselSourceRefresh
const coreTimers = []
const coreWatchers = []
let lastRuntimeErrorAt = 0
let artworkTimer
let artworkTransferId = 0
let artworkWorkerRunning = false
let requestedArtworkCenter = null
let requestedArtworkWindowSize = 7
let initialArtworkQueued = false
const artworkCache = new Map()
// The paired legacy firmware has seven physical 80x80 RGB565 slots. This is
// deliberately Core-owned rather than provider-owned: only one active carousel
// may bind a physical slot at a time.
const DEVICE_CACHE_CAPACITY = 7
const legacyArtworkResidency = new LegacyArtworkResidency(DEVICE_CACHE_CAPACITY)
const deviceAssetKeys = new Set()
let deviceAssetQueue = Promise.resolve()
const wireScheduler = new WireScheduler()
const localDeviceAssets = new Map()
let localDeviceAssetBytes = 0
const LOCAL_DEVICE_ASSET_MEMORY_LIMIT = 64 * 1024 * 1024
let lastArtworkCenterIndex = null
const savedControlSelections = (() => {
  try { return JSON.parse(readFileSync(controlSelectionStatePath, 'utf8')) }
  catch { return {} }
})()
let goXlrChannelIndex = Math.max(0, GOXLR_CHANNELS.findIndex(
  ([channel]) => channel === savedControlSelections.goXlrChannel))
let goXlrPercent = 0
let goXlrMuted = false
let goXlrQueue = Promise.resolve()
const goXlrSoftMuteState = new Map()
let homeAssistantConfig
let visualPreferences
let homeAssistantLightIndex = -1
let homeAssistantAvailableLightIds = new Set()
let homeAssistantQueue = Promise.resolve()
let homeAssistantMediaQueue = Promise.resolve()
const relativeSeek = new RelativeSeek()
let homeAssistantMediaTarget
let homeAssistantMediaTargetRefreshedAt = 0
let homeAssistantMediaTrack = null
let homeAssistantMediaTrackResolvedAt = 0
let homeAssistantMediaRefresh
let homeAssistantMediaRetryAt = 0
let homeAssistantMediaFailureCount = 0
const homeAssistantTargets = new Map()
const plexEpisodeTitleCache = new Map()
const homeAssistantRestoreBrightness = new Map()
const plexCollection = {
  active: false,
  items: [],
  itemById: new Map(),
  artworkCache: new Map(),
  reservedArtworkSlots: new Set(),
  pendingArtwork: new Map(),
  preloadTimer: undefined,
  initialArtworkQueued: false,
  refresh: undefined,
  refreshedAt: 0,
}
let plexActivationQueue = Promise.resolve()
const carouselSessions = new CarouselSessionCoordinator()
const artworkAssetStore = new ArtworkAssetStore()
const artworkTransferScheduler = new ArtworkTransferScheduler()
const legacyDirectArtTransport = createLegacyDirectArtTransport({
  capacity: DEVICE_CACHE_CAPACITY,
  artSize: ART_SIZE,
  chunkPixels: CHUNK_PIXELS,
  chunkGapMs: ARTWORK_CHUNK_GAP_MS,
  titleLimit: TITLE_LIMIT,
  packetTypes: { begin: GAME_CARD_BEGIN, chunk: GAME_ART_CHUNK, commit: GAME_CARD_COMMIT },
  report,
})
const artworkTransport = createArtworkTransport({
  supportsKeyedCache: () => deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION,
  sendKeyed: async ({ port, session, itemIndex, artwork, isCurrent }) => {
    const key = await ensureDeviceAsset(artwork.assetKey, artwork.bytes)
    if (!isCurrent()) return false
    const bind = Buffer.allocUnsafe(5)
    bind.writeUInt32BE(key, 0)
    bind[4] = itemIndex
    await sendConfirmedCachePacket(port, CACHE_FILE_BIND, bind)
    return true
  },
  sendDirect: ({ port, session, slot, itemIndex, title, artwork, isCurrent }) =>
    sendDirectArtwork(port, session, slot, itemIndex, title, artwork.bytes, isCurrent),
})
let advertisedDeviceCacheBytes = 256 * 1024
let deviceCacheProtocolVersion = 0
let deviceCapabilities = null
let nextCacheTransactionId = 1
const firmwareAcks = new ProtocolAckTracker()

function deviceAssetKey(name) {
  // Zero is reserved by firmware as "no asset".
  const key = createHash('sha256').update(String(name)).digest().readUInt32BE(0)
  return key === 0 ? 1 : key
}

function collectionCardBegin(sessionId, assetName, itemIndex, title, width = 0, height = 0) {
  const key = deviceAssetKey(assetName)
  const safeTitle = boundedTitle(title)
  const begin = Buffer.allocUnsafe(14 + safeTitle.length)
  begin.writeUInt32BE(sessionId >>> 0, 0)
  begin.writeUInt32BE(key, 4)
  begin[8] = itemIndex
  begin.writeUInt16BE(width, 9)
  begin.writeUInt16BE(height, 11)
  begin[13] = safeTitle.length
  safeTitle.copy(begin, 14)
  return { key, begin }
}

function sendCachePacket(port, type, body) {
  // Commit packets are intentionally payload-free; normalize them before the
  // negotiated frame-size check used by cache transfers.
  body ??= Buffer.alloc(0)
  // The packaged serial wrapper guards its public sendPacket API at 240 bytes
  // for the old firmware. Protocol-v2 cache chunks advertise a larger device
  // frame and use the wrapper's existing framed sender only after negotiation.
  if (body.length <= 240) return port.sendPacket(type, body)
  if (!port?.isOpen || typeof port.send !== 'function') return false
  try {
    port.send(type, body)
    return true
  } catch {
    return false
  }
}

function queueWirePacket(port, type, body, { acknowledge = false } = {}) {
  const connectionId = deviceConnectionId
  const transactionId = acknowledge && deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION
    ? ((nextCacheTransactionId++ % 0xffff) || (nextCacheTransactionId++ % 0xffff)) : 0
  if (transactionId) body = Buffer.concat([body ?? Buffer.alloc(0), Buffer.from([transactionId >> 8, transactionId & 0xff])])
  return wireScheduler.enqueue({
    epoch: connectionId,
    key: `${connectionId}/${type}`,
    priority: acknowledge ? 0 : 1,
    execute: async () => {
      if (port !== activePort || connectionId !== deviceConnectionId) return false
      if (!acknowledge) return sendCachePacket(port, type, body)
      const acknowledgement = firmwareAcks.waitFor(type, { epoch: connectionId, transactionId })
      if (!sendCachePacket(port, type, body)) {
        firmwareAcks.reject(type, `Could not send cache packet ${type}`, { epoch: connectionId, transactionId })
      }
      await acknowledgement
      return true
    },
  })
}

// All ordinary device traffic shares the same connection-epoch writer as
// cache traffic. The caller may continue without awaiting UI/status updates,
// but stale packets are rejected before they reach a newly connected device.
function queueDevicePacket(port, type, body = Buffer.alloc(0), { key, priority = 1, replace = false } = {}) {
  const connectionId = deviceConnectionId
  return wireScheduler.enqueue({
    epoch: connectionId,
    key: key ?? `${connectionId}/packet/${type}`,
    priority,
    replace,
    execute: async () => {
      if (port !== activePort || connectionId !== deviceConnectionId) return false
      return sendCachePacket(port, type, body)
    },
  })
}

function isCurrentCarouselTransfer(session, port) {
  return carouselSessions.isActive(session) && activePort === port
}

async function sendDirectArtwork(port, session, slot, itemIndex, title, artwork) {
  return legacyDirectArtTransport.send({
    port, session, slot, itemIndex, title, artwork,
    isCurrent: () => isCurrentCarouselTransfer(session, port),
  })
}

function queueDirectArtwork(session, slot, itemIndex, title, artwork, priority = 1) {
  const assetKey = typeof artwork === 'string'
    ? artwork
    : artworkAssetStore.publish(`${session.id}/${itemIndex}`, artwork)
  const lease = artworkAssetStore.lease(assetKey)
  if (!lease) return Promise.resolve(false)
  return artworkTransferScheduler.enqueue({
    key: `${session.wireSessionId}/${itemIndex}`,
    priority,
    isCurrent: () => isCurrentCarouselTransfer(session, activePort),
    execute: async () => {
      try {
        const port = activePort
        if (!isCurrentCarouselTransfer(session, port)) return false
        // The provider only supplies an asset and logical item. Firmware
        // protocol selection belongs to the transport adapter.
        return await artworkTransport.send({
          port, session, slot, itemIndex, title,
          artwork: { assetKey, bytes: lease.bytes },
          isCurrent: () => isCurrentCarouselTransfer(session, port),
        })
      } finally {
        lease.release()
      }
    },
  }).catch(error => {
    report('artwork-transfer-error', {
      sessionId: session?.wireSessionId ?? null, itemIndex, message: String(error),
    })
    return false
  })
}

function localDeviceAssetPath(key) {
  return join(deviceFileCacheRoot, `${key.toString(16).padStart(8, '0')}.rgb565`)
}

function retainLocalDeviceAsset(key, artwork) {
  const previous = localDeviceAssets.get(key)
  if (previous) localDeviceAssetBytes -= previous.length
  localDeviceAssets.set(key, artwork)
  localDeviceAssetBytes += artwork.length
  while (localDeviceAssetBytes > LOCAL_DEVICE_ASSET_MEMORY_LIMIT && localDeviceAssets.size > 1) {
    const [oldestKey, oldest] = localDeviceAssets.entries().next().value
    localDeviceAssets.delete(oldestKey)
    localDeviceAssetBytes -= oldest.length
  }
}

async function stageDeviceAsset(assetName, artwork) {
  const key = deviceAssetKey(assetName)
  retainLocalDeviceAsset(key, artwork)
  const path = localDeviceAssetPath(key)
  if (!existsSync(path)) {
    await mkdir(deviceFileCacheRoot, { recursive: true })
    await writeFile(path, artwork)
  }
  return { key, artwork }
}

async function restoreStagedDeviceAsset(assetName, fallback) {
  const key = deviceAssetKey(assetName)
  const resident = localDeviceAssets.get(key)
  if (resident) return { key, artwork: resident }
  const path = localDeviceAssetPath(key)
  const artwork = existsSync(path) ? await readFile(path) : fallback
  if (!Buffer.isBuffer(artwork) || artwork.length !== ART_SIZE * ART_SIZE * 2) {
    throw new Error(`Invalid local cache file for ${assetName}`)
  }
  retainLocalDeviceAsset(key, artwork)
  return { key, artwork }
}

async function uploadDeviceAsset(assetName, artwork) {
  const startedAt = performance.now()
  const port = activePort
  const staged = await restoreStagedDeviceAsset(assetName, artwork)
  const key = staged.key
  if (!port || deviceAssetKeys.has(key)) return key
  const begin = Buffer.allocUnsafe(8)
  begin.writeUInt32BE(key, 0)
  begin.writeUInt16BE(ART_SIZE, 4)
  begin.writeUInt16BE(ART_SIZE, 6)
  await sendConfirmedCachePacket(port, CACHE_FILE_BEGIN, begin)
  for (let offset = 0; offset < staged.artwork.length; offset += CACHE_CHUNK_BYTES) {
    if (port !== activePort) throw new Error('Device disconnected during cache upload')
    const count = Math.min(CACHE_CHUNK_BYTES, staged.artwork.length - offset)
    const chunk = Buffer.allocUnsafe(4 + count)
    chunk.writeUInt32BE(offset, 0)
    staged.artwork.copy(chunk, 4, offset, offset + count)
    if (!await queueWirePacket(port, CACHE_FILE_CHUNK, chunk)) throw new Error('Could not write cache file')
    await new Promise(resolve => setTimeout(resolve, CACHE_PACKET_GAP_MS))
  }
  await sendConfirmedCachePacket(port, CACHE_FILE_COMMIT)
  deviceAssetKeys.add(key)
  report('device-cache-upload-queued', {
    assetName,
    key,
    bytes: staged.artwork.length,
    chunks: Math.ceil(staged.artwork.length / CACHE_CHUNK_BYTES),
    durationMs: Math.round(performance.now() - startedAt),
  })
  return key
}

async function sendConfirmedCachePacket(port, packetType, body) {
  if (!await queueWirePacket(port, packetType, body, { acknowledge: true })) {
    throw new Error('Device disconnected before cache packet could be sent')
  }
}

function ensureDeviceAsset(assetName, artwork) {
  const previousQueue = deviceAssetQueue
  const queued = stageDeviceAsset(assetName, artwork).then(() => previousQueue.then(
    () => uploadDeviceAsset(assetName, artwork),
    () => uploadDeviceAsset(assetName, artwork),
  ))
  deviceAssetQueue = queued.catch(error => report('device-cache-upload-error', {
    assetName, message: String(error),
  }))
  return queued
}

function cancelSteamArtworkTransfers() {
  ++artworkTransferId
  requestedArtworkCenter = null
  clearTimeout(artworkTimer)
  clearTimeout(plexCollection.preloadTimer)
  plexCollection.preloadTimer = undefined
  plexCollection.initialArtworkQueued = false
  lastArtworkCenterIndex = null
  initialArtworkQueued = false
}

async function waitForSteamArtworkWorker() {
  while (artworkWorkerRunning) {
    await new Promise(resolve => setTimeout(resolve, ARTWORK_CHUNK_GAP_MS))
  }
}

function collectionPresentation(value = {}) {
  const idle = Buffer.from(String(value.idleAction ?? 'Select to activate'), 'utf8')
    .subarray(0, PROTOCOL.collection.maxActionLabelBytes)
  const active = Buffer.from(String(value.activeAction ?? 'Activating...'), 'utf8')
    .subarray(0, PROTOCOL.collection.maxActionLabelBytes)
  if (idle.length === 0 || active.length === 0) throw new Error('Carousel presentation labels are required')
  return Buffer.concat([Buffer.from([idle.length, active.length]), idle, active])
}

async function openCarouselSession(session, options = {}) {
  const port = activePort
  if (!port) throw new Error('MakeShift is not connected')
  const boundSession = await carouselSessions.open(session, async ({ session: candidate, isCurrent }) => {
    // Invalidate prior view work before sending a new list. Direct artwork
    // must never interleave with or outlive the collection it belongs to.
    cancelSteamArtworkTransfers()
    legacyArtworkResidency.reset()
    resetPlexCollectionArtworkSlots()
    if (!isCurrent()) return false
    if (candidate.resetArtwork) await Promise.resolve(candidate.resetArtwork())
    if (!isCurrent()) return false
    if (!await queueDevicePacket(port, GAME_LIST_BEGIN, Buffer.from([candidate.items.length]), {
      key: `${candidate.wireSessionId}/list-begin`, priority: 0,
    })) {
      throw new Error('Could not start carousel list transfer')
    }
    const presentation = options.presentation ?? candidate.presentation
    if (!await queueDevicePacket(port, COLLECTION_PRESENTATION, collectionPresentation(presentation), {
      key: `${candidate.wireSessionId}/presentation`, priority: 0,
    })) {
      throw new Error('Could not set carousel presentation')
    }
    for (const item of candidate.items) {
      if (!isCurrent()) return false
      const itemId = Buffer.from(item.itemId, 'ascii')
      const title = boundedTitle(item.title)
      const body = Buffer.allocUnsafe(2 + itemId.length + title.length)
      body[0] = itemId.length; body[1] = title.length
      itemId.copy(body, 2); title.copy(body, 2 + itemId.length)
      if (!await queueDevicePacket(port, GAME_LIST_ITEM, body, {
        key: `${candidate.wireSessionId}/item/${item.itemId}`, priority: 0,
      })) throw new Error('Could not send carousel item')
    }
    if (!isCurrent()) return false
    if (deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION) {
      for (const [index, item] of candidate.items.entries()) {
        const assetName = artworkAssetStore.identities.get(item.artworkIdentity)
        if (!assetName) continue
        const key = deviceAssetKey(assetName)
        if (!deviceAssetKeys.has(key)) continue
        if (!isCurrent() || port !== activePort) return false
        const bind = Buffer.alloc(5)
        bind.writeUInt32BE(key, 0)
        bind[4] = index
        await sendConfirmedCachePacket(port, CACHE_FILE_BIND, bind)
      }
    }
    if (!await queueDevicePacket(port, GAME_LIST_COMMIT, Buffer.alloc(0), {
          key: `${candidate.wireSessionId}/list-commit`, priority: 0,
        }) || port !== activePort ||
        !await queueDevicePacket(port, COLLECTION_INPUT_BINDING,
          Buffer.from([candidate.input.dial, candidate.input.button]), {
            key: `${candidate.wireSessionId}/input-binding`, priority: 0,
          })) {
      throw new Error('Could not open carousel')
    }
    return true
  })
  if (!boundSession) return
  report('carousel-opened', { id: boundSession.id, sessionId: boundSession.wireSessionId, itemCount: boundSession.items.length, ...boundSession.input })
  if (boundSession.preload) {
    report('carousel-preload-requested', { id: boundSession.id, sessionId: boundSession.wireSessionId, source: 'open' })
    void Promise.resolve(boundSession.preload()).catch(error =>
      report('carousel-preload-error', { id: boundSession.id, message: String(error) }))
  }
}
const buttonGestures = new Map()
let deviceConnectionId = 0
let lastNowPlaying = ''
let pandoraTrack = null
let pandoraRunning = false
let pandoraStartedAt = 0
let pandoraAudioActive = false
let mediaSessionTrack = null
let mediaSessionReader
let nowPlayingState = (() => {
  try {
    const saved = JSON.parse(readFileSync(nowPlayingStatePath, 'utf8'))
    if (saved?.title && saved?.artist) return { ...saved, isPlaying: false }
  } catch { }
  return { source: 'pandora', title: '', artist: '', album: '', isPlaying: false, changedAt: null }
})()
let nowPlayingWrite = Promise.resolve()
let firmwareUpdateInProgress = false
let inputCaptureUntil = 0
let pandoraCatalogSignature = ''
let pandoraCatalogValues = []

async function saveControlSelections() {
  const selectedLight = selectedHomeAssistantLight()
  const state = {
    goXlrChannel: GOXLR_CHANNELS[goXlrChannelIndex]?.[0],
    homeAssistantEntityId: selectedLight?.entityId,
  }
  try {
    await mkdir(dirname(controlSelectionStatePath), { recursive: true })
    await writeFile(controlSelectionStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  } catch (error) {
    report('selection-state-error', { message: String(error) })
  }
}

const PANDORA_LEVELDB = join(
  process.env.LOCALAPPDATA,
  'Packages', 'PandoraMediaInc.29680B314EFC2_n619g4d5j0fnw',
  'LocalCache', 'Roaming', 'Pandora', 'IndexedDB',
  'https_www.pandora.com_0.indexeddb.leveldb',
)

function report(event, details = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })
  process.stdout.write(`${line}\n`)
  // Preserve runtime evidence across widget and agent restarts.
  const logName = `agent-${new Date().toISOString().slice(0, 10)}.ndjson`
  void mkdir(logRoot, { recursive: true })
    .then(() => appendFile(join(logRoot, logName), `${line}\n`, 'utf8'))
    .catch(() => {})
}

const serialLifecycle = new SerialLifecycle({
  serial,
  report,
  onOpened: attachPort,
  onClosed: detachPort,
})

async function pruneRuntimeLogs() {
  const oldestAllowed = Date.now() - 90 * 24 * 60 * 60 * 1000
  try {
    const entries = await readdir(logRoot, { withFileTypes: true })
    await Promise.all(entries
      .filter(entry => entry.isFile() && /^agent-\d{4}-\d{2}-\d{2}\.ndjson$/.test(entry.name))
      .map(async entry => {
        const path = join(logRoot, entry.name)
        if ((await stat(path)).mtimeMs < oldestAllowed) await unlink(path)
      }))
  } catch { /* The directory is created by the first logged event. */ }
}

function reportRuntimeError(kind, error) {
  if (shuttingDown) return
  const message = String(error?.stack ?? error)
  const now = Date.now()
  if (now - lastRuntimeErrorAt >= 5000) {
    lastRuntimeErrorAt = now
    report('protocol-error', { kind, message })
  }
  if (/COM port|GetOverlappedResult|SerialPort/i.test(message)) {
    report('recovering', { reason: 'serial-write-failure' })
    if (process.env.MAKESHIFT_CORE_RUNTIME === '1') {
      // Core remains available while the lifecycle owner serializes teardown
      // and discovery. Duplicate transport failures collapse into one reset.
      serialLifecycle.scheduleRecovery('serial-write-failure', {
        beforeReset: detachPort,
      })
    } else {
      // The deployed legacy agent is supervised by the Systray widget.
      setTimeout(() => process.exit(3), 150).unref()
    }
  }
}

function captureInputEdge(buttonIndex, edge, payload) {
  if (Date.now() > inputCaptureUntil) return
  const buttons = payload?.state?.buttons ?? []
  report('input-edge', {
    buttonIndex,
    edge,
    activeButtons: buttons.flatMap((pressed, index) => pressed ? [index] : []),
  })
}

function runProcess(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...options })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `${file} exited ${code}`)))
  })
}

async function readGoXlrStatus() {
  const output = await runProcess(GOXLR_CLIENT, ['--status-http', '--status-json'])
  const status = JSON.parse(output)
  const mixer = Object.values(status?.mixers ?? {})[0]
  if (!mixer) throw new Error('No GoXLR mixer is available')
  return mixer
}

function sendGoXlrStatus(adjusting, name, percent, muted = false) {
  if (!activePort) return
  const label = boundedTitle(name)
  void queueDevicePacket(activePort, GOXLR_STATUS, Buffer.concat([
    Buffer.from([(adjusting ? 1 : 0) | (muted ? 2 : 0), Math.max(0, Math.min(100, percent))]), label,
  ]))
}

function sendStatusBadge(zone, adjusting, name, percent, inactive = false) {
  if (!activePort) return
  const label = boundedTitle(name)
  void queueDevicePacket(activePort, STATUS_BADGE, Buffer.concat([
    Buffer.from([zone, (adjusting ? 1 : 0) | (inactive ? 2 : 0),
      Math.max(0, Math.min(100, percent))]),
    label,
  ]))
}

function canonicalScreenZone(name) {
  const normalized = String(name ?? '').trim().toLowerCase().replaceAll('_', '-')
  const canonical = SCREEN_ZONE_ALIASES.get(normalized) ?? normalized
  if (!(canonical in SCREEN_ZONES)) throw new Error(`Unknown screen zone: ${name}`)
  return canonical
}

function requireScreenZoneCapability(zone, capability) {
  const canonical = canonicalScreenZone(zone)
  if (!SCREEN_ZONE_CAPABILITIES[canonical].includes(capability)) {
    throw new Error(`Screen zone ${canonical} does not support ${capability}`)
  }
  return canonical
}

function sendScreenZoneText(zone, value, options = {}) {
  const canonical = requireScreenZoneCapability(zone, 'text')
  if (!activePort) return false
  const text = Buffer.from(String(value ?? ''), 'utf8').subarray(0, 159)
  if (text.length === 0) return clearScreenZone(canonical)
  const active = options.active === false ? 0 : 1
  void queueDevicePacket(activePort, canonical === 'upper-text' ? NOW_PLAYING : SCREEN_ZONE,
    Buffer.concat([canonical === 'upper-text'
      ? Buffer.from([active])
      : Buffer.from([SCREEN_ZONES[canonical], 1, active]), text]))
  return true
}

function sendScreenZoneAsset(zone, name, cue) {
  const canonical = requireScreenZoneCapability(zone, 'asset')
  const asset = runtimeAssetForName(name, cue)
  if (!activePort || !asset?.id) return false
  void queueDevicePacket(activePort, canonical === 'center' ? ACTION_GLYPH : SCREEN_ZONE,
    canonical === 'center' ? Buffer.from([asset.id])
      : Buffer.from([SCREEN_ZONES[canonical], 2, asset.id]))
  return true
}

function sendScreenZoneStatus(zone, status = {}) {
  const canonical = requireScreenZoneCapability(zone, 'status')
  if (!activePort) return false
  const label = boundedTitle(String(status.label ?? ''))
  const flags = (status.adjusting ? 1 : 0) | (status.inactive ? 2 : 0)
  const percent = Math.max(0, Math.min(100, Number(status.percent ?? 0)))
  if (canonical === 'bottom-left' || canonical === 'bottom-right') {
    sendStatusBadge(SCREEN_ZONES[canonical], Boolean(status.adjusting),
      String(status.label ?? ''), percent, Boolean(status.inactive))
  } else {
    void queueDevicePacket(activePort, SCREEN_ZONE, Buffer.concat([
      Buffer.from([SCREEN_ZONES[canonical], 3, flags, percent]), label,
    ]))
  }
  return Boolean(activePort)
}

function clearScreenZone(zone) {
  const canonical = requireScreenZoneCapability(zone, 'clear')
  if (!activePort) return false
  if (canonical === 'upper-text') {
    void queueDevicePacket(activePort, NOW_PLAYING, Buffer.from([0, 32]))
    return true
  }
  void queueDevicePacket(activePort, SCREEN_ZONE, Buffer.from([SCREEN_ZONES[canonical], 0]))
  return true
}

function screenZonePlugin(cue) {
  return Object.freeze({
    names: SCREEN_ZONES,
    capabilities: SCREEN_ZONE_CAPABILITIES,
    text: (zone, value, options) => sendScreenZoneText(zone, value, options),
    asset: (zone, name) => sendScreenZoneAsset(zone, name, cue),
    status: (zone, value) => sendScreenZoneStatus(zone, value),
    clear: zone => clearScreenZone(zone),
  })
}

function runtimeAssetForName(name, cue) {
  const normalized = name?.includes('.') ? name : `media.${name}`
  const candidates = cue ? [cue] : modules.values()
  for (const module of candidates) {
    const asset = module?.runtimeAssets?.find(candidate => candidate?.name === normalized)
    if (asset) return asset
  }
  return RUNTIME_ASSETS.get(normalized)
}

function sendOverlayGlyph(name, cue) {
  if (!activePort) return
  const glyphId = runtimeAssetForName(name, cue)?.id ?? OVERLAY_GLYPHS.get(name)
  if (!glyphId) return
  activePort.sendPacket(ACTION_GLYPH, Buffer.from([glyphId]))
}

function loadHomeAssistantConfig() {
  homeAssistantMediaTarget = undefined
  homeAssistantMediaTargetRefreshedAt = 0
  homeAssistantMediaTrack = null
  homeAssistantMediaTrackResolvedAt = 0
  homeAssistantMediaRetryAt = 0
  homeAssistantMediaFailureCount = 0
  try {
    const config = JSON.parse(readFileSync(homeAssistantConfigPath, 'utf8'))
    const baseUrl = String(config?.baseUrl ?? '').replace(/\/+$/, '')
    const plexBaseUrl = String(config?.plexBaseUrl ?? '').replace(/\/+$/, '')
    const token = String(config?.token ?? '')
    const initialEntityId = String(config?.initialEntityId ?? '')
    const lights = Array.isArray(config?.lights) ? config.lights.filter(light =>
      typeof light?.entityId === 'string' && typeof light?.label === 'string') : []
    const mediaPlayers = Array.isArray(config?.mediaPlayers)
      ? config.mediaPlayers.filter(entityId => typeof entityId === 'string') : []
    const directMediaRemotes = Object.fromEntries(Object.entries(config?.directMediaRemotes ?? {})
      .filter(([entityId, remoteId]) => typeof entityId === 'string' &&
        typeof remoteId === 'string' && entityId.startsWith('media_player.') &&
        remoteId.startsWith('remote.')))
    const mediaLastActiveEntityId = String(config?.mediaLastActiveEntityId ?? '')
    homeAssistantConfig = baseUrl && token
      ? { baseUrl, plexBaseUrl, token, lights, initialEntityId, mediaPlayers,
        mediaLastActiveEntityId, directMediaRemotes }
      : undefined
    homeAssistantAvailableLightIds = new Set(lights.map(light => light.entityId))
    if (homeAssistantConfig && homeAssistantLightIndex >= lights.length) {
      homeAssistantLightIndex = -1
    }
    if (homeAssistantConfig && homeAssistantLightIndex < 0) {
      const saved = lights.findIndex(
        light => light.entityId === savedControlSelections.homeAssistantEntityId)
      const preferred = saved >= 0
        ? saved
        : lights.findIndex(light => light.entityId === initialEntityId)
      homeAssistantLightIndex = preferred >= 0 ? preferred : 0
    }
  } catch {
    homeAssistantConfig = undefined
    homeAssistantAvailableLightIds = new Set()
  }
}

async function homeAssistantRequest(path, options = {}) {
  if (!homeAssistantConfig) throw new Error('Home Assistant is not configured')
  const request = () => fetch(`${homeAssistantConfig.baseUrl}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(5000),
    headers: {
      Authorization: `Bearer ${homeAssistantConfig.token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  let response
  try {
    response = await request()
  } catch (error) {
    const method = String(options.method ?? 'GET').toUpperCase()
    if (method !== 'GET') throw error
    await new Promise(resolve => setTimeout(resolve, 250))
    response = await request()
  }
  if (!response.ok) throw new Error(`Home Assistant ${response.status}: ${await response.text()}`)
  return response.status === 204 ? undefined : response.json()
}

function homeAssistantWebSocketUrl() {
  if (!homeAssistantConfig?.baseUrl) throw new Error('Home Assistant is not configured')
  return `${homeAssistantConfig.baseUrl.replace(/^http/i, 'ws')}/api/websocket`
}

async function callHomeAssistantWebSocket(command, timeoutMs = 15000) {
  const socket = new WebSocket(homeAssistantWebSocketUrl())
  return new Promise((resolve, reject) => {
    let authenticated = false
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try { socket.close() } catch { }
      if (error) reject(error)
      else resolve(value)
    }
    const timeout = setTimeout(() => finish(new Error('Home Assistant WebSocket timed out')), timeoutMs)
    socket.addEventListener('error', () => finish(new Error('Home Assistant WebSocket connection failed')))
    socket.addEventListener('message', async event => {
      try {
        const raw = typeof event.data === 'string' ? event.data : await event.data.text()
        const message = JSON.parse(raw)
        if (message.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: homeAssistantConfig.token }))
        } else if (message.type === 'auth_ok') {
          authenticated = true
          socket.send(JSON.stringify({ id: 1, ...command }))
        } else if (message.type === 'auth_invalid') {
          finish(new Error('Home Assistant WebSocket authentication failed'))
        } else if (authenticated && message.id === 1) {
          if (message.success) finish(undefined, message.result)
          else finish(new Error(`${message.error?.code ?? 'home_assistant_error'}: ${message.error?.message ?? 'request failed'}`))
        }
      } catch (error) {
        finish(error)
      }
    })
  })
}

function plexCollectionArtworkPath(item) {
  const source = String(item.poster_image ?? item.image ?? '')
  if (!source.startsWith('data:image/')) return ''
  const extension = /^data:image\/png/i.test(source) ? 'png' : 'jpg'
  const fingerprint = createHash('sha256').update(source).digest('hex').slice(0, 16)
  return join(appData, 'plex-continue-watching-art', `${item.rating_key}-${fingerprint}.${extension}`)
}

async function cachePlexCollectionArtwork(item) {
  const cachePath = plexCollectionArtworkPath(item)
  if (!cachePath || existsSync(cachePath)) return cachePath
  const source = String(item.poster_image ?? item.image ?? '')
  const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/i.exec(source)
  if (!match) return ''
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, Buffer.from(match[1], 'base64'))
  return cachePath
}

async function fetchPlexContinueWatching() {
  const result = await callHomeAssistantWebSocket({
    type: 'plex_carousel/continue_watching', limit: PLEX_COLLECTION_LIMIT,
  })
  // The original contract documented { items }, while the current HA command
  // returns the collection directly. Accept both during the transition.
  const sourceItems = Array.isArray(result) ? result :
    Array.isArray(result?.items) ? result.items : []
  const items = await Promise.all(sourceItems.slice(0, PLEX_COLLECTION_LIMIT).map(async (source, index) => {
    const series = String(source.grandparent_title ?? '').trim()
    const season = Number(source.parent_index)
    const episode = Number(source.index)
    const code = Number.isInteger(season) && Number.isInteger(episode)
      ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : ''
    const episodeTitle = String(source.title ?? '').trim()
    const title = series ? [series, code].filter(Boolean).join(' ') +
      (episodeTitle ? ` - ${episodeTitle}` : '') : episodeTitle
    return {
    itemId: String(source.rating_key ?? ''),
    title,
    viewOffset: Math.max(0, Number(source.view_offset) || 0),
    artworkPath: await cachePlexCollectionArtwork(source),
    rank: PLEX_COLLECTION_LIMIT - index,
    }
  }))
  const valid = items.filter(item => /^\d+$/.test(item.itemId) && item.title)
  if (valid.length === 0) throw new Error('Home Assistant returned no usable Continue Watching items')
  return valid
}

async function plexCollectionArtwork(item) {
  const cached = plexCollection.artworkCache.get(item.itemId)
  if (cached) return cached
  const pending = (async () => {
    const result = Buffer.alloc(ART_SIZE * ART_SIZE * 2)
    if (!item.artworkPath || !existsSync(item.artworkPath)) return result
    Jimp ??= requireFromCtrl('jimp')
    const image = await Jimp.read(item.artworkPath)
    // Preserve portrait Plex posters instead of cropping them into a square.
    image.background(0x08121aff).contain(
      ART_SIZE,
      ART_SIZE,
      Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE,
    )
    for (let index = 0; index < ART_SIZE * ART_SIZE; index++) {
      const red = image.bitmap.data[index * 4]
      const green = image.bitmap.data[index * 4 + 1]
      const blue = image.bitmap.data[index * 4 + 2]
      result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), index * 2)
    }
    return result
  })()
  plexCollection.artworkCache.set(item.itemId, pending)
  return pending
}

async function sendPlexCollectionArtwork(item, slot = 0, session = carouselSessions.active, priorityRef = { value: 2 }) {
  const port = activePort
  if (!port || !item || session?.id !== 'plex-continue-watching') return false
  const itemIndex = session.items.indexOf(item)
  if (itemIndex < 0) return false
  const assetKey = await artworkAssetStore.prepare(
    `plex/${item.itemId}`,
    () => plexCollectionArtwork(item),
  )
  const bound = await queueDirectArtwork(session, slot, itemIndex, item.title, assetKey, priorityRef.value)
  if (bound) legacyArtworkResidency.bind(slot, `plex:${itemIndex}`)
  return bound
}

function resetPlexCollectionArtworkSlots() {
  clearTimeout(plexCollection.preloadTimer)
  plexCollection.preloadTimer = undefined
  plexCollection.initialArtworkQueued = false
  // Bindings belong to one firmware collection list. Files remain in the
  // shared cache, but a reopened/rebooted view must bind them again.
  legacyArtworkResidency.reset()
  plexCollection.reservedArtworkSlots.clear()
  plexCollection.pendingArtwork.clear()
}

function queuePlexCollectionArtwork(item, preferredSlot, session = carouselSessions.active, priority = 2) {
  const itemIndex = session.items.indexOf(item)
  if (itemIndex < 0) return Promise.resolve(false)
  if (legacyArtworkResidency.has(`plex:${itemIndex}`)) return Promise.resolve(true)
  const pending = plexCollection.pendingArtwork.get(itemIndex)
  if (pending) {
    // Raise a decoding or queued preload when the user selects the same item.
    pending.priority = Math.min(pending.priority, priority)
    artworkTransferScheduler.promote(`${session.wireSessionId}/${itemIndex}`, priority)
    return pending.promise
  }

  const availableSlot = legacyArtworkResidency.findSlot((value, index) =>
    value === null && !plexCollection.reservedArtworkSlots.has(index))
  const slot = Number.isInteger(preferredSlot) && preferredSlot >= 0 && preferredSlot < DEVICE_CACHE_CAPACITY &&
    !plexCollection.reservedArtworkSlots.has(preferredSlot)
    ? preferredSlot : availableSlot >= 0 ? availableSlot : 0
  plexCollection.reservedArtworkSlots.add(slot)
  const transfer = { priority, promise: undefined }
  const queued = sendPlexCollectionArtwork(item, slot, session, transfer).catch(error => {
    report('plex-collection-artwork-error', { itemId: item.itemId, message: String(error) })
    return false
  })
  transfer.promise = queued
  plexCollection.pendingArtwork.set(itemIndex, transfer)
  void queued.then(
    () => {
      if (plexCollection.pendingArtwork.get(itemIndex) === transfer) {
        plexCollection.pendingArtwork.delete(itemIndex)
        plexCollection.reservedArtworkSlots.delete(slot)
      }
    },
    () => {
      if (plexCollection.pendingArtwork.get(itemIndex) === transfer) {
        plexCollection.pendingArtwork.delete(itemIndex)
        plexCollection.reservedArtworkSlots.delete(slot)
      }
    },
  )
  return queued
}

async function loadPlexCollectionArtwork(item) {
  const itemIndex = carouselSessions.active?.items.indexOf(item) ?? -1
  if (itemIndex < 0) return false
  if (legacyArtworkResidency.has(`plex:${itemIndex}`)) return true
  return queuePlexCollectionArtwork(item, undefined, carouselSessions.active, 0)
}

async function refreshPlexContinueWatchingCache(force = false) {
  const feedFresh = plexCollection.items.length > 0 &&
    !force && Date.now() - plexCollection.refreshedAt < 5 * 60 * 1000
  if (feedFresh) return plexCollection.items
  if (!plexCollection.refresh) {
    plexCollection.refresh = fetchPlexContinueWatching()
      .then(items => {
        plexCollection.items = items
        plexCollection.itemById = new Map(items.map(item => [item.itemId, item]))
        plexCollection.artworkCache.clear()
        // Plex can replace a poster without changing its rating key.
        artworkAssetStore.invalidatePrefix('plex/')
        plexCollection.refreshedAt = Date.now()
        return items
      })
      .finally(() => { plexCollection.refresh = undefined })
  }
  return plexCollection.refresh
}

async function prewarmPlexContinueWatchingCache() {
  const items = await refreshPlexContinueWatchingCache()
  await Promise.all(items.map(item => artworkAssetStore.prepare(
    `plex/${item.itemId}`,
    () => plexCollectionArtwork(item),
  )))
  report('plex-collection-ready', {
    itemCount: items.length,
    artworkStore: artworkAssetStore.snapshot(),
  })
  return items
}

function queueInitialPlexArtwork(items) {
  const session = carouselSessions.active
  if (session?.id !== 'plex-continue-watching') return
  items = session.items
  if (plexCollection.initialArtworkQueued) return
  plexCollection.initialArtworkQueued = true
  clearTimeout(plexCollection.preloadTimer)
  plexCollection.preloadTimer = setTimeout(() => {
    if (!carouselSessions.isActive(session)) return
    // Match the Steam carousel's post-open settle window before card traffic.
    // Forward rotation is the normal interaction: make the current card and
    // the next two cards visible before spending bandwidth behind the cursor.
    const initialItems = [...new Set([0, 1, 2])]
      .map(index => items[index])
      .filter(Boolean)
    void Promise.all(initialItems.map((item, slot) =>
      queuePlexCollectionArtwork(item, slot, session, 1)))
      .then(() => {
        // Reserve the other three keyed-cache slots for Steam's opening cards.
        if (deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION) return
        return Promise.all(items.slice(3, 7).map((item, offset) =>
          queuePlexCollectionArtwork(item, offset + 3, session, 2)))
      }).catch(error =>
      report('plex-collection-artwork-error', { message: String(error) }))
  }, ARTWORK_SETTLE_MS)
  plexCollection.preloadTimer.unref()
}

async function createPlexContinueWatchingSession(input) {
  const items = plexCollection.items.length > 0
    ? plexCollection.items : await refreshPlexContinueWatchingCache()
  if (plexCollection.items.length > 0) void refreshPlexContinueWatchingCache()
  plexCollection.active = true
  return {
    id: 'plex-continue-watching',
    input,
    items: items.map(item => ({ ...item, artworkIdentity: `plex/${item.itemId}` })),
    resetArtwork: resetPlexCollectionArtworkSlots,
    loadArtwork: item => loadPlexCollectionArtwork(item),
    activate: item => activatePlexCollectionItem(item.itemId),
    preload: () => queueInitialPlexArtwork(items),
  }
}

async function playPlexCollectionItem(item, attempt) {
  const result = await callHomeAssistantWebSocket({
    type: 'plex_carousel/play', rating_key: item.itemId, offset: item.viewOffset,
  }, 45000)
  if (result?.method !== 'native_plex') throw new Error('Plex did not confirm native playback')
  report('plex-collection-activated', {
    itemId: item.itemId, title: item.title, method: result.method, attempt,
  })
}

function activatePlexCollectionItem(itemId) {
  const item = plexCollection.itemById.get(String(itemId))
  if (!item) return Promise.reject(new Error(`Unknown Plex collection item: ${itemId}`))
  const activation = plexActivationQueue.then(async () => {
    // Serialize physical clicks, but do not replay blindly: a delayed native
    // Plex handoff can already be playing when a second request arrives.
    await playPlexCollectionItem(item, 1)
  })
  plexActivationQueue = activation.catch(error => report('plex-collection-activation-error', {
    itemId: item.itemId, message: String(error),
  }))
  return activation
}

async function discoverHomeAssistantMediaPlayer() {
  const players = homeAssistantConfig?.mediaPlayers ?? []
  if (players.length === 0) return undefined

  const resolved = await Promise.allSettled(players.map(async entityId => ({
    entityId,
    state: await homeAssistantRequest(`/api/states/${encodeURIComponent(entityId)}`),
  })))
  const states = resolved.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const failures = resolved.filter(result => result.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(`Media discovery failed for ${failures.length}/${players.length} configured player(s): ${String(failures[0].reason)}`)
  }
  const active = states.find(candidate => candidate.state?.state === 'playing')?.entityId
  if (active) {
    // Passive discovery must not mutate Home Assistant or trigger automations.
    return active
  }

  // A paused displayed session is still the user's active media target.
  // Retain that exact device rather than selecting an arbitrary paused player
  // elsewhere in the house.
  const retained = states.find(candidate =>
    candidate.entityId === homeAssistantMediaTrack?.entityId &&
    candidate.state?.state === 'paused')?.entityId
  if (retained) return retained

  const helper = homeAssistantConfig.mediaLastActiveEntityId
  if (!helper) return undefined
  const remembered = await homeAssistantRequest(`/api/states/${encodeURIComponent(helper)}`)
  const entityId = String(remembered?.state ?? '')
  if (!players.includes(entityId)) return undefined
  const state = states.find(candidate => candidate.entityId === entityId)?.state ??
    await homeAssistantRequest(`/api/states/${encodeURIComponent(entityId)}`)
  return ['playing', 'paused', 'buffering'].includes(state?.state) ? entityId : undefined
}

async function plexMetadataAttributes(metadataKey) {
  if (!homeAssistantConfig?.plexBaseUrl || !/^\d+$/.test(metadataKey)) return null
  const response = await fetch(
    `${homeAssistantConfig.plexBaseUrl}/library/metadata/${metadataKey}`,
    { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Plex metadata ${response.status}`)
  Xml2js ??= requireFromCtrl('xml2js')
  const parsed = await Xml2js.parseStringPromise(await response.text())
  const item = parsed?.MediaContainer?.Video?.[0]?.$
  const title = String(item?.title ?? '').trim()
  if (!title) return null
  return {
    media_title: title,
    media_series_title: String(item.grandparentTitle ?? '').trim(),
    media_season: item.parentIndex,
    media_episode: item.index,
  }
}

async function plexEpisodeAttributesByTitle(title) {
  const normalizedTitle = String(title ?? '').trim().toLocaleLowerCase()
  if (!homeAssistantConfig?.plexBaseUrl || !normalizedTitle) return null
  const cached = plexEpisodeTitleCache.get(normalizedTitle)
  if (cached && Date.now() - cached.resolvedAt < PLEX_TITLE_LOOKUP_TTL_MS) return cached.attributes

  const response = await fetch(
    `${homeAssistantConfig.plexBaseUrl}/library/all?type=4&title=${encodeURIComponent(title)}`,
    { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Plex episode title lookup ${response.status}`)
  Xml2js ??= requireFromCtrl('xml2js')
  const parsed = await Xml2js.parseStringPromise(await response.text())
  const matches = (parsed?.MediaContainer?.Video ?? [])
    .map(video => video?.$ ?? {})
    .filter(video => String(video.type ?? '').toLowerCase() === 'episode' &&
      String(video.title ?? '').trim().toLocaleLowerCase() === normalizedTitle)
    .map(video => ({
      media_title: String(video.title ?? '').trim(),
      media_series_title: String(video.grandparentTitle ?? '').trim(),
      media_season: Number.parseInt(video.parentIndex, 10),
      media_episode: Number.parseInt(video.index, 10),
    }))
    .filter(video => video.media_title && video.media_series_title &&
      Number.isInteger(video.media_season) && Number.isInteger(video.media_episode))
  const identities = new Map(matches.map(video => [
    `${video.media_series_title}\u0000${video.media_season}\u0000${video.media_episode}`, video,
  ]))
  // Ambiguous titles must remain untouched rather than being mislabeled.
  const attributes = identities.size === 1 ? identities.values().next().value : null
  plexEpisodeTitleCache.set(normalizedTitle, { resolvedAt: Date.now(), attributes })
  return attributes
}

async function homeAssistantNowPlaying(state, entityId) {
  if (!['playing', 'paused'].includes(state?.state)) return null
  let attributes = state.attributes ?? {}
  let title = String(attributes.media_title ?? attributes.title ?? '').trim()
  let fallbackApp = String(attributes.app_name ?? '').trim()
  const contentId = String(attributes.media_content_id ?? '')
  const plexMatch = contentId.match(/(?:\/metadata\/)?(\d+)$/)
  const seriesBeforeLookup = String(attributes.media_series_title ?? '').trim()
  const seasonBeforeLookup = Number.parseInt(attributes.media_season, 10)
  const episodeBeforeLookup = Number.parseInt(attributes.media_episode, 10)

  // Android TV/Cast states can provide an episode title without its series
  // fields. Resolve a Plex content ID whenever that record is incomplete so
  // both MakeShift and the widget-owned API receive a normalized episode.
  const needsPlexMetadata = !title || !seriesBeforeLookup ||
    !Number.isInteger(seasonBeforeLookup) || !Number.isInteger(episodeBeforeLookup)
  if (plexMatch && needsPlexMetadata) {
    try {
      const plexAttributes = await plexMetadataAttributes(plexMatch[1])
      if (plexAttributes) attributes = { ...attributes, ...plexAttributes }
    } catch (error) {
      report('plex-metadata-error', { key: plexMatch[1], message: String(error) })
    }
    title = String(attributes.media_title ?? attributes.title ?? '').trim()
    if (title) fallbackApp = ''
  }

  // Some Cast states omit the Plex metadata key entirely. When Plex is the
  // identified app and the record is still missing episode coordinates, use
  // the bounded, ambiguity-safe title lookup as a fallback.
  const needsTitleLookup = !seriesBeforeLookup ||
    !Number.isInteger(seasonBeforeLookup) || !Number.isInteger(episodeBeforeLookup)
  if (!plexMatch && needsTitleLookup && title) {
    try {
      const plexAttributes = await plexEpisodeAttributesByTitle(title)
      if (plexAttributes) attributes = { ...attributes, ...plexAttributes }
    } catch (error) {
      report('plex-metadata-title-error', { title, message: String(error) })
    }
  }

  // Cast integrations can omit titles while another HA media-player entity
  // exposes metadata for the same item. Android TV entities can still provide
  // the foreground app when no integration exposes content metadata.
  if (!title) {
    title = String(attributes.media_title ?? attributes.title ?? '').trim()
    if (title) fallbackApp = ''

    const states = await homeAssistantRequest('/api/states')
    const mediaPlayers = states.filter(candidate =>
      candidate?.entity_id?.startsWith('media_player.'))
    const linked = !title && plexMatch && mediaPlayers.find(candidate =>
      candidate.state === 'playing' &&
      String(candidate.attributes?.media_content_id ?? '') === plexMatch[1] &&
      String(candidate.attributes?.media_title ?? '').trim())
    if (linked) attributes = linked.attributes
    title = String(attributes.media_title ?? attributes.title ?? '').trim()

    if (!title && !fallbackApp) {
      const friendlyName = String(state.attributes?.friendly_name ?? '').trim()
      const companion = mediaPlayers.find(candidate =>
        candidate.entity_id !== state.entity_id &&
        String(candidate.attributes?.friendly_name ?? '').trim() === friendlyName &&
        String(candidate.attributes?.app_name ?? '').trim())
      fallbackApp = String(companion?.attributes?.app_name ?? '').trim()
    }
  }

  if (!title && fallbackApp.toLowerCase() !== 'plex') title = fallbackApp
  if (!title) return null
  const artist = String(attributes.media_artist ?? attributes.artist ??
    attributes.media_series_title ?? '').trim()
  const series = String(attributes.media_series_title ?? '').trim()
  const season = Number.parseInt(attributes.media_season, 10)
  const episode = Number.parseInt(attributes.media_episode, 10)
  const episodeCode = Number.isInteger(season) && Number.isInteger(episode)
    ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
    : ''
  const episodicPrefix = [series, episodeCode].filter(Boolean).join(' ')
  const displayText = series
    ? [episodicPrefix, title].filter(Boolean).join(' - ')
    : [title, artist].filter(Boolean).join('  - ')
  return {
    source: 'home-assistant', entityId, title, artist, album: '',
    isPlaying: state.state === 'playing', isPaused: state.state === 'paused',
    seriesTitle: series, seasonNumber: Number.isInteger(season) ? season : null,
    episodeNumber: Number.isInteger(episode) ? episode : null,
    mediaContentId: contentId || null,
    displayText,
  }
}

async function refreshHomeAssistantMediaPlayer() {
  if (homeAssistantMediaRefresh) return homeAssistantMediaRefresh
  if (Date.now() < homeAssistantMediaRetryAt) return homeAssistantMediaTarget
  homeAssistantMediaRefresh = discoverHomeAssistantMediaPlayer()
    .then(async entityId => {
      homeAssistantMediaFailureCount = 0
      homeAssistantMediaRetryAt = 0
      homeAssistantMediaTarget = entityId
      homeAssistantMediaTargetRefreshedAt = Date.now()
      if (!entityId) {
        homeAssistantMediaTrack = null
        homeAssistantMediaTrackResolvedAt = 0
        publishNowPlaying()
        return entityId
      }
      try {
        const state = await homeAssistantRequest(
          `/api/states/${encodeURIComponent(entityId)}`)
        const resolvedTrack = await homeAssistantNowPlaying(state, entityId)
        if (resolvedTrack) {
          homeAssistantMediaTrack = resolvedTrack
          homeAssistantMediaTrackResolvedAt = Date.now()
        } else if (Date.now() - homeAssistantMediaTrackResolvedAt > 30000) {
          homeAssistantMediaTrack = null
        }
      } catch (error) {
        report('home-assistant-now-playing-error', { message: String(error) })
      }
      publishNowPlaying()
      return entityId
    })
    .catch(error => {
      homeAssistantMediaFailureCount++
      const retryMs = Math.min(60000, 2000 * 2 ** Math.min(homeAssistantMediaFailureCount - 1, 5))
      homeAssistantMediaRetryAt = Date.now() + retryMs
      report('home-assistant-media-backoff', {
        failures: homeAssistantMediaFailureCount, retryMs, message: String(error),
      })
      // Keep the last usable track visible while the integration recovers.
      return homeAssistantMediaTarget
    })
    .finally(() => { homeAssistantMediaRefresh = undefined })
  return homeAssistantMediaRefresh
}

async function resolveHomeAssistantMediaPlayer({ forceRefresh = false } = {}) {
  if (!forceRefresh && homeAssistantMediaTarget &&
      Date.now() - homeAssistantMediaTargetRefreshedAt < 60000) {
    return homeAssistantMediaTarget
  }
  return refreshHomeAssistantMediaPlayer()
}

async function routeHomeAssistantMedia(action, { entityId: pinnedEntityId } = {}) {
  relativeSeek.clear()
  const startedAt = Date.now()
  const cachedTargetAgeMs = homeAssistantMediaTarget
    ? startedAt - homeAssistantMediaTargetRefreshedAt : undefined
  const services = {
    playPause: 'media_play_pause',
    next: 'media_next_track',
    previous: 'media_previous_track',
  }
  const service = services[action]
  if (!service) throw new Error(`Unsupported media action: ${action}`)
  // When the screen displays a Home Assistant source, controls use the exact
  // entity that supplied that displayed metadata. Do not independently select
  // another playing player and make the screen/control paths disagree.
  const entityId = pinnedEntityId ?? await resolveHomeAssistantMediaPlayer({ forceRefresh: true })
  report('home-assistant-media-resolved', {
    action,
    entityId: entityId ?? null,
    fresh: true,
  })
  if (!entityId) return false
  const targetState = await homeAssistantRequest(
    `/api/states/${encodeURIComponent(entityId)}`)
  if (!['playing', 'paused', 'buffering'].includes(targetState?.state)) {
    report('home-assistant-media-unavailable', { action, entityId, state: targetState?.state })
    return false
  }
  const remoteEntityId = homeAssistantConfig?.directMediaRemotes?.[entityId]
  const remoteCommand = {
    playPause: 'MEDIA_PLAY_PAUSE',
    next: 'MEDIA_NEXT',
    previous: 'MEDIA_PREVIOUS',
  }[action]
  // Google TV maps MEDIA_NEXT/PREVIOUS to a timeline seek in Plex. Prefer the
  // media-player service for actual track/episode navigation; the remote key
  // is retained as a compatibility fallback. Play/pause remains a remote key
  // because it is the most reliable direct control for Chromecast.
  const useRemoteFirst = action === 'playPause'
  const sendRemoteCommand = async () => {
    await homeAssistantRequest('/api/services/remote/send_command', {
      method: 'POST',
      body: JSON.stringify({ entity_id: remoteEntityId, command: remoteCommand }),
    })
    report('home-assistant-remote-media', {
      action, entityId, remoteEntityId, command: remoteCommand,
      durationMs: Date.now() - startedAt,
    })
    setTimeout(() => {
      void refreshHomeAssistantMediaPlayer().catch(error =>
        report('home-assistant-media-refresh-error', { message: String(error) }))
    }, 500).unref()
    return true
  }
  const sendPlayerService = async () => {
    await homeAssistantRequest(`/api/services/media_player/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
    report('home-assistant-media', {
      action,
      entityId,
      durationMs: Date.now() - startedAt,
      cachedTargetAgeMs,
    })
    setTimeout(() => {
      void refreshHomeAssistantMediaPlayer().catch(error =>
        report('home-assistant-media-refresh-error', { message: String(error) }))
    }, 500).unref()
    return true
  }

  if (useRemoteFirst && remoteEntityId && remoteCommand) return sendRemoteCommand()
  try {
    return await sendPlayerService()
  } catch (error) {
    if (!remoteEntityId || !remoteCommand) throw error
    report('home-assistant-media-service-fallback', {
      action, entityId, remoteEntityId, message: String(error),
    })
    return sendRemoteCommand()
  }
}

function queueHomeAssistantMedia(action, options) {
  const run = () => routeHomeAssistantMedia(action, options)
  homeAssistantMediaQueue = homeAssistantMediaQueue.then(run, run)
    .catch(error => {
      report('home-assistant-media-error', { action, message: String(error) })
      return false
    })
  return homeAssistantMediaQueue
}

async function routeDisplayedHomeAssistantMedia(action) {
  if (mediaSourceMode === 'local') return false
  if (mediaSourceMode === 'chromecast') {
    await queueHomeAssistantMedia(action, { entityId: homeAssistantMediaTrack?.entityId })
    return true
  }
  if (nowPlayingState.source !== 'home-assistant') return false
  const entityId = homeAssistantMediaTrack?.entityId
  if (!entityId) {
    report('home-assistant-media-display-target-missing', { action })
    // The screen says Home Assistant, so never fall through to unrelated PC media.
    return true
  }
  await queueHomeAssistantMedia(action, { entityId })
  return true
}

async function seekHomeAssistantMediaRelative(deltaSeconds, { entityId: pinnedEntityId } = {}) {
  const entityId = pinnedEntityId ?? await resolveHomeAssistantMediaPlayer()
  if (!entityId) return false

  const requestedAt = Date.now()
  await homeAssistantRequest('/api/services/homeassistant/update_entity', {
    method: 'POST', body: JSON.stringify({ entity_id: entityId }),
  })
  const state = await homeAssistantRequest(`/api/states/${encodeURIComponent(entityId)}`)
  let plan
  try { plan = relativeSeek.plan(entityId, state, deltaSeconds, Date.now(), requestedAt) }
  catch (error) {
    report('media-seek-withheld', { entityId, deltaSeconds,
      positionUpdatedAt: state?.attributes?.media_position_updated_at ?? null,
      reason: String(error) })
    return false
  }
  const target = plan.target

  await homeAssistantRequest('/api/services/media_player/media_seek', {
    method: 'POST',
    body: JSON.stringify({ entity_id: entityId, seek_position: target }),
  })
  relativeSeek.commit(plan)
  report('home-assistant-media-seek', { entityId, deltaSeconds, target,
    reportedPosition: plan.reported, reusedSuccessfulSeek: plan.reused })
  return true
}

function queueHomeAssistantMediaSeek(deltaSeconds, options) {
  const run = () => seekHomeAssistantMediaRelative(deltaSeconds, options)
  homeAssistantMediaQueue = homeAssistantMediaQueue.then(run, run)
    .catch(error => {
      report('home-assistant-media-seek-error', { deltaSeconds, message: String(error) })
      return false
    })
  return homeAssistantMediaQueue
}

function activeNowPlayingProvider() {
  if (mediaSourceMode === 'chromecast') return 'home-assistant'
  if (mediaSourceMode === 'local') return mediaSessionTrack?.source || 'local'
  if (nowPlayingState.source === 'home-assistant') return 'home-assistant'
  if (!nowPlayingState.isPlaying) return undefined
  return nowPlayingState.source || undefined
}

function persistNowPlayingState(state) {
  const payload = `${JSON.stringify(state)}\n`
  const temporaryPath = `${nowPlayingStatePath}.${process.pid}.tmp`
  // Serialize replacement so API readers see either the prior complete JSON
  // document or the next one, never a partially written state file.
  nowPlayingWrite = nowPlayingWrite.catch(() => {}).then(async () => {
    await mkdir(dirname(nowPlayingStatePath), { recursive: true })
    await writeFile(temporaryPath, payload, 'utf8')
    await rename(temporaryPath, nowPlayingStatePath)
  })
  return nowPlayingWrite
}

async function seekActiveNowPlayingRelative(deltaSeconds) {
  const provider = activeNowPlayingProvider()
  if (provider === 'home-assistant') {
    const entityId = homeAssistantMediaTrack?.entityId
    if (!entityId) {
      report('home-assistant-media-seek-display-target-missing', { deltaSeconds })
      return false
    }
    return queueHomeAssistantMediaSeek(deltaSeconds, { entityId })
  }
  report('media-seek-unsupported', { provider: provider ?? 'none', deltaSeconds })
  return false
}

async function sendDesktopMediaKey(action) {
  const keys = {
    playPause: 'AudioPlay',
    next: 'AudioNext',
    previous: 'AudioPrev',
  }
  const key = keys[action]
  if (!key) throw new Error(`Unsupported desktop media action: ${action}`)
  Nut ??= requireFromCtrl('@nut-tree-fork/nut-js')
  return Nut.keyboard.type(Nut.Key[key])
}

async function runSystemActions(...actions) {
  if (!existsSync(windowsRecoveryScript)) {
    throw new Error(`Windows recovery script is missing: ${windowsRecoveryScript}`)
  }
  const actionSwitches = {
    'display.wake': '-WakeDisplay',
    'graphics.reset': '-ResetGraphics',
  }
  const switches = actions.map(action => actionSwitches[action])
  if (switches.length === 0 || switches.some(value => !value)) {
    throw new Error(`Unsupported system action: ${actions.join(', ')}`)
  }
  report('system-actions-started', { actions })
  try {
    const output = await runProcess('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      windowsRecoveryScript, ...switches,
    ])
    report('system-actions-complete', { actions, output: output.trim() })
    return true
  } catch (error) {
    report('system-actions-failed', { actions, message: String(error) })
    throw error
  }
}

function flashCueLeds({ color = '#ff0000', durationMs = 500 } = {}) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color))
  if (!match || !activePort) return false
  const rgb = match[1]
  const duration = Math.max(50, Math.min(5000, Math.round(Number(durationMs) || 500)))
  const body = Buffer.from([
    1,
    Number.parseInt(rgb.slice(0, 2), 16),
    Number.parseInt(rgb.slice(2, 4), 16),
    Number.parseInt(rgb.slice(4, 6), 16),
    duration >> 8,
    duration & 0xff,
  ])
  void queueDevicePacket(activePort, LED_EFFECT, body, { priority: 0 })
  report('led-effect', { effect: 'flash-all', color: `#${rgb.toLowerCase()}`, durationMs: duration, sent: true })
  return true
}

const systemPlugin = Object.freeze({
  media: Object.freeze({
    cycleSource: cycleMediaSource,
    send: sendDesktopMediaKey,
    seekActiveRelative: seekActiveNowPlayingRelative,
  }),
  leds: Object.freeze({ flash: flashCueLeds }),
  run: (...actions) => runSystemActions(...actions),
})

const privatePluginServices = Object.freeze({
  'integration.goxlr': Object.freeze({
    goXlr: Object.freeze({
      toggleCurrentMute: () => queueGoXlr(toggleGoXlrMute),
      adjustCurrentVolume: delta => queueGoXlr(() => adjustGoXlrChannel(delta)),
    }),
  }),
  'integration.home-assistant-lights': Object.freeze({
    homeAssistantLights: Object.freeze({
      selectNext: () => queueHomeAssistant(selectNextHomeAssistantLight),
      adjustBrightness: delta => queueHomeAssistant(() => adjustHomeAssistantLight(delta)),
      togglePower: () => queueHomeAssistant(toggleHomeAssistantLight),
    }),
  }),
  'integration.home-assistant-media': Object.freeze({
    homeAssistantMedia: Object.freeze({
      route: action => queueHomeAssistantMedia(action),
      routeDisplayed: action => routeDisplayedHomeAssistantMedia(action),
      seekRelative: deltaSeconds => queueHomeAssistantMediaSeek(deltaSeconds),
    }),
  }),
  'integration.game-launcher': Object.freeze({
    gameLauncher: Object.freeze({
      createSession: input => createSteamCarouselSession(input),
    }),
  }),
  'integration.home-assistant-collections': Object.freeze({
    homeAssistantCollections: Object.freeze({
      createPlexContinueWatchingSession: input => createPlexContinueWatchingSession(input),
    }),
  }),
})

function pluginServicesFor(permissions) {
  const services = {}
  for (const permission of permissions) {
    const granted = privatePluginServices[permission]
    if (!granted) throw new Error(`Unsupported plugin permission: ${permission}`)
    Object.assign(services, granted)
  }
  return Object.freeze(services)
}

function registerCuePlugin(definition) {
  const id = String(definition?.id ?? '')
  if (!/^[a-z][a-z0-9.-]*$/i.test(id)) {
    throw new Error(`Invalid cue plugin id: ${id}`)
  }
  if (typeof definition.create !== 'function') {
    throw new Error(`Cue plugin ${id} must export a create function`)
  }
  if (cuePluginRegistry.has(id)) {
    throw new Error(`Cue plugin id is already registered: ${id}`)
  }
  cuePluginRegistry.set(id, Object.freeze({
    id,
    source: definition.source ?? 'built-in',
    version: String(definition.version ?? '0.0.0'),
    create: definition.create,
  }))
}

function registerBuiltInCuePlugins() {
  if (cuePluginRegistry.size !== 0) return
  registerCuePlugin({ id: 'system', version: '1.0.0', create: () => systemPlugin })
  registerCuePlugin({ id: 'desktopMedia', version: '1.0.0',
    create: () => Object.freeze({ send: sendDesktopMediaKey }) })
  registerCuePlugin({ id: 'screenZones', version: '1.0.0',
    create: ({ cue }) => screenZonePlugin(cue) })
  registerCuePlugin({ id: 'carousel', version: '1.0.0',
    create: () => Object.freeze({
      open: openCarouselSession,
      isOpen: session => carouselSessions.active?.id === session?.id,
      activateFirst: async session => {
        const first = session?.items?.[0]
        if (!first || !session.activate) return false
        await session.activate(first)
        report('carousel-first-activated', { id: session.id, itemId: first.itemId, title: first.title })
        return true
      },
    }) })
}

function loadUserCuePlugins() {
  for (const [id, plugin] of cuePluginRegistry) {
    if (plugin.source.startsWith('user:')) cuePluginRegistry.delete(id)
  }
  if (!existsSync(cuePluginRoot)) return
  for (const entry of readdirSync(cuePluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pluginRoot = join(cuePluginRoot, entry.name)
    try {
      const manifest = JSON.parse(readFileSync(join(pluginRoot, 'manifest.json'), 'utf8'))
      const id = String(manifest.id ?? '')
      const entryName = String(manifest.entry ?? '')
      const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : []
      if (!entryName || entryName.includes('..') || entryName.includes('/') ||
          entryName.includes('\\')) throw new Error('manifest entry must be a local file name')
      const entryPath = join(pluginRoot, entryName)
      if (!existsSync(entryPath)) throw new Error(`entry file not found: ${entryName}`)
      delete requireFromCtrl.cache?.[requireFromCtrl.resolve(entryPath)]
      const module = requireFromCtrl(entryPath)
      registerCuePlugin({
        id,
        version: manifest.version,
        source: `user:${entry.name}`,
        create: context => module.create(Object.freeze({
          cueId: context.cueId,
          system: systemPlugin,
          services: pluginServicesFor(permissions),
        })),
      })
      report('cue-plugin-loaded', { id, version: manifest.version, folder: entry.name })
    } catch (error) {
      report('cue-plugin-error', { folder: entry.name, message: String(error) })
    }
  }
}

function installCuePlugins(cue, cueId) {
  const required = Array.isArray(cue.requiredPlugins) ? cue.requiredPlugins : []
  for (const id of new Set(required)) {
    const plugin = cuePluginRegistry.get(id)
    if (!plugin) throw new Error(`Cue requires unavailable plugin: ${id}`)
    cue.plugins[id] = plugin.create(Object.freeze({ cue, cueId }))
  }
}

function disposeCue(cue, cueId) {
  const disposables = Object.values(cue?.plugins ?? {})
    .filter(plugin => typeof plugin?.dispose === 'function')
  for (const plugin of disposables) {
    try {
      void Promise.resolve(plugin.dispose()).catch(error =>
        report('cue-dispose-error', { cueId, message: String(error) }))
    } catch (error) {
      report('cue-dispose-error', { cueId, message: String(error) })
    }
  }
  if (typeof cue?.dispose === 'function') {
    try {
      void Promise.resolve(cue.dispose()).catch(error =>
        report('cue-dispose-error', { cueId, message: String(error) }))
    } catch (error) {
      report('cue-dispose-error', { cueId, message: String(error) })
    }
  }
}

function disposeCueSet(cues) {
  for (const [cueId, cue] of cues) disposeCue(cue, cueId)
}

function selectedHomeAssistantLight() {
  if (!homeAssistantConfig || homeAssistantLightIndex < 0) return undefined
  return homeAssistantConfig.lights[homeAssistantLightIndex]
}

function availableHomeAssistantLightIndices() {
  if (!homeAssistantConfig) return []
  return homeAssistantConfig.lights.flatMap((light, index) =>
    homeAssistantAvailableLightIds.has(light.entityId) ? [index] : [])
}

function homeAssistantBrightnessPercent(state) {
  if (state?.state !== 'on') return 0
  const brightness = Number(state?.attributes?.brightness)
  return Number.isFinite(brightness) ? Math.round(brightness * 100 / 255) : 100
}

function snapHomeAssistantPercent(percent) {
  return Math.max(0, Math.min(100, Math.round(percent / 25) * 25))
}

function homeAssistantLightStatus(light, state) {
  if (!light || state?.state === 'unavailable' || state?.state === 'unknown') return
  const percent = snapHomeAssistantPercent(homeAssistantBrightnessPercent(state))
  homeAssistantTargets.set(light.entityId, percent)
  if (percent > 0 && !homeAssistantRestoreBrightness.has(light.entityId)) {
    homeAssistantRestoreBrightness.set(light.entityId, percent)
  }
  return { label: light.label, percent, inactive: state?.state !== 'on' }
}

async function readHomeAssistantLightStatus(light = selectedHomeAssistantLight()) {
  if (!light) return
  const state = await homeAssistantRequest(`/api/states/${encodeURIComponent(light.entityId)}`)
  return homeAssistantLightStatus(light, state)
}

async function refreshHomeAssistantLightAvailability(showSelected = false) {
  if (!homeAssistantConfig) return
  const states = await homeAssistantRequest('/api/states')
  const stateByEntityId = new Map(states.map(state => [state.entity_id, state]))
  homeAssistantAvailableLightIds = new Set(homeAssistantConfig.lights
    .filter(light => {
      const state = stateByEntityId.get(light.entityId)
      return state && state.state !== 'unavailable' && state.state !== 'unknown'
    })
    .map(light => light.entityId))

  const availableIndices = availableHomeAssistantLightIndices()
  if (availableIndices.length === 0) {
    homeAssistantLightIndex = -1
    return
  }
  if (!availableIndices.includes(homeAssistantLightIndex)) {
    const next = availableIndices.find(index => index > homeAssistantLightIndex)
    homeAssistantLightIndex = next ?? availableIndices[0]
    void saveControlSelections()
  }

  const light = selectedHomeAssistantLight()
  const status = homeAssistantLightStatus(light, stateByEntityId.get(light.entityId))
  if (showSelected && status && activePort) {
    sendStatusBadge(1, false, status.label, status.percent, status.inactive)
  }
  return status
}

async function showHomeAssistantLight(light = selectedHomeAssistantLight()) {
  const status = await readHomeAssistantLightStatus(light)
  if (status) sendStatusBadge(1, false, status.label, status.percent, status.inactive)
}

async function selectNextHomeAssistantLight() {
  if (!homeAssistantConfig) return
  await refreshHomeAssistantLightAvailability()
  const availableIndices = availableHomeAssistantLightIndices()
  if (availableIndices.length === 0) return
  const currentPosition = availableIndices.indexOf(homeAssistantLightIndex)
  homeAssistantLightIndex = availableIndices[(currentPosition + 1) % availableIndices.length]
  void saveControlSelections()
  await showHomeAssistantLight()
}

async function adjustHomeAssistantLight(delta) {
  if (!homeAssistantConfig) return
  if (homeAssistantLightIndex < 0) await selectNextHomeAssistantLight()
  const light = selectedHomeAssistantLight()
  if (!light) return
  let current = homeAssistantTargets.get(light.entityId)
  if (current === undefined) {
    const state = await homeAssistantRequest(`/api/states/${encodeURIComponent(light.entityId)}`)
    current = snapHomeAssistantPercent(homeAssistantBrightnessPercent(state))
    const remembered = Number(state?.attributes?.brightness)
    const restorePercent = Number.isFinite(remembered)
      ? snapHomeAssistantPercent(Math.round(remembered * 100 / 255))
      : current
    homeAssistantRestoreBrightness.set(light.entityId,
      Math.max(25, restorePercent || 100))
  }
  const target = Math.max(0, Math.min(100, current + Math.sign(delta) * 25))
  const service = target === 0 ? 'turn_off' : 'turn_on'
  const body = target === 0
    ? { entity_id: light.entityId }
    : { entity_id: light.entityId, brightness_pct: target }
  await homeAssistantRequest(`/api/services/light/${service}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  homeAssistantTargets.set(light.entityId, target)
  sendStatusBadge(1, true, light.label, target, target === 0)
}

async function toggleHomeAssistantLight() {
  const light = selectedHomeAssistantLight()
  if (!light) return
  const state = await homeAssistantRequest(`/api/states/${encodeURIComponent(light.entityId)}`)
  const turnOn = state?.state !== 'on'
  const currentPercent = snapHomeAssistantPercent(homeAssistantBrightnessPercent(state))
  if (!turnOn && !homeAssistantRestoreBrightness.has(light.entityId)) {
    homeAssistantRestoreBrightness.set(light.entityId, Math.max(25, currentPercent || 100))
  }
  const restorePercent = homeAssistantRestoreBrightness.get(light.entityId) ?? 100
  await homeAssistantRequest(`/api/services/light/${turnOn ? 'turn_on' : 'turn_off'}`, {
    method: 'POST',
    body: JSON.stringify(turnOn
      ? { entity_id: light.entityId, brightness_pct: restorePercent }
      : { entity_id: light.entityId }),
  })
  if (turnOn) homeAssistantRestoreBrightness.delete(light.entityId)
  const percent = turnOn ? restorePercent : 0
  homeAssistantTargets.set(light.entityId, percent)
  sendStatusBadge(1, false, light.label, percent, !turnOn)
}

function queueHomeAssistant(action) {
  const port = activePort
  const connectionId = deviceConnectionId
  if (!port) return
  const runForCurrentDevice = async () => {
    if (activePort !== port || deviceConnectionId !== connectionId) return
    await action()
  }
  homeAssistantQueue = homeAssistantQueue.then(runForCurrentDevice, runForCurrentDevice)
    .catch(error => report('home-assistant-error', { message: String(error) }))
}

function displayedGoXlrPercent(cliName, livePercent, selected) {
  if (selected) return livePercent
  const saved = goXlrSoftMuteState.get(cliName)
  if (saved?.muted === true) {
    return Math.max(0, Math.min(100, saved?.previousPercent ?? livePercent))
  }
  return livePercent
}

function mapCliNameToStatusChannel(cliName) {
  return cliName.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

function findSelectedFader(mixer) {
  if (goXlrChannelIndex < 0) return null
  const [cliName, label] = GOXLR_CHANNELS[goXlrChannelIndex]
  const statusChannel = mapCliNameToStatusChannel(cliName)
  const faderEntry = Object.entries(mixer?.fader_status ?? {}).find(([, status]) => status?.channel === statusChannel)
  if (!faderEntry) return null
  const [fader, status] = faderEntry
  return { cliName, label, statusChannel, fader: fader.toLowerCase(), status }
}

async function selectNextGoXlrChannel() {
  const mixer = await readGoXlrStatus()
  goXlrChannelIndex = (goXlrChannelIndex + 1) % GOXLR_CHANNELS.length
  void saveControlSelections()
  const [cliName, label] = GOXLR_CHANNELS[goXlrChannelIndex]
  const statusName = mapCliNameToStatusChannel(cliName)
  goXlrPercent = Math.round((mixer?.levels?.volumes?.[statusName] ?? 0) * 100 / 255)
  const selected = findSelectedFader(mixer)
  const softMuted = goXlrSoftMuteState.get(cliName)?.muted === true
  goXlrMuted = selected ? selected.status?.mute_state !== 'Unmuted' : softMuted
  sendGoXlrStatus(false, label,
    displayedGoXlrPercent(cliName, goXlrPercent, selected), goXlrMuted)
}

async function readSelectedGoXlrStatus() {
  const mixer = await readGoXlrStatus()
  const [cliName, label] = GOXLR_CHANNELS[goXlrChannelIndex]
  const statusName = mapCliNameToStatusChannel(cliName)
  goXlrPercent = Math.round((mixer?.levels?.volumes?.[statusName] ?? 0) * 100 / 255)
  const selected = findSelectedFader(mixer)
  const softMuted = goXlrSoftMuteState.get(cliName)?.muted === true
  goXlrMuted = selected ? selected.status?.mute_state !== 'Unmuted' : softMuted
  return {
    label,
    percent: displayedGoXlrPercent(cliName, goXlrPercent, selected),
    muted: goXlrMuted,
  }
}

async function refreshSelectedGoXlrChannel() {
  const status = await readSelectedGoXlrStatus()
  sendGoXlrStatus(false, status.label, status.percent, status.muted)
}

async function adjustGoXlrChannel(delta) {
  if (goXlrChannelIndex < 0) await selectNextGoXlrChannel()
  const [cliName, label] = GOXLR_CHANNELS[goXlrChannelIndex]
  // Physical GoXLR faders can move outside Ctrl. Read the mixer immediately
  // before each relative MakeShift adjustment so a stale screen value never
  // causes a visible jump back to the previous percentage.
  const mixer = await readGoXlrStatus()
  const statusName = mapCliNameToStatusChannel(cliName)
  const currentPercent = Math.round((mixer?.levels?.volumes?.[statusName] ?? 0) * 100 / 255)
  goXlrPercent = Math.max(0, Math.min(100, currentPercent + Math.sign(delta) * 2))
  const target = goXlrPercent
  sendGoXlrStatus(true, label, target, goXlrMuted)
  await runProcess(GOXLR_CLIENT, ['volume', cliName, String(target)])
}

async function toggleGoXlrMute() {
  if (goXlrChannelIndex < 0) await selectNextGoXlrChannel()
  const mixer = await readGoXlrStatus()
  const [cliName, label] = GOXLR_CHANNELS[goXlrChannelIndex]
  const statusChannel = mapCliNameToStatusChannel(cliName)
  const selected = findSelectedFader(mixer)
  if (!selected) {
    const currentPercent = Math.round((mixer?.levels?.volumes?.[statusChannel] ?? 0) * 100 / 255)
    const saved = goXlrSoftMuteState.get(cliName)
    const muted = saved?.muted === true
    const restorePercent = muted ? Math.max(0, Math.min(100, saved?.previousPercent ?? 0)) : currentPercent
    const target = muted ? restorePercent : 0
    goXlrSoftMuteState.set(cliName, {
      muted: !muted,
      previousPercent: muted ? restorePercent : currentPercent,
    })
    await runProcess(GOXLR_CLIENT, ['volume', cliName, String(target)])
    goXlrPercent = restorePercent
    goXlrMuted = !muted
    sendGoXlrStatus(false, label, restorePercent, goXlrMuted)
    sendOverlayGlyph(muted ? 'unmute' : 'mute')
    return
  }

  const muteType = selected.status?.mute_type === 'ToX' ? 'muted-to-x' : 'muted-to-all'
  const willBeMuted = selected.status?.mute_state === 'Unmuted'
  const nextState = willBeMuted ? muteType : 'unmuted'
  await runProcess(GOXLR_CLIENT, ['faders', 'mute-state', selected.fader, nextState])
  goXlrMuted = willBeMuted
  sendGoXlrStatus(false, selected.label, goXlrPercent, goXlrMuted)
  sendOverlayGlyph(willBeMuted ? 'mute' : 'unmute')
}

function queueGoXlr(action) {
  const port = activePort
  const connectionId = deviceConnectionId
  if (!port) return
  const runForCurrentDevice = async () => {
    if (activePort !== port || deviceConnectionId !== connectionId) return
    await action()
  }
  goXlrQueue = goXlrQueue.then(runForCurrentDevice, runForCurrentDevice)
    .catch(error => report('goxlr-error', { message: String(error) }))
}

function preloadActiveStatusZones() {
  const port = activePort
  const connectionId = deviceConnectionId
  if (!port) return
  return Promise.allSettled([
    readSelectedGoXlrStatus(),
    refreshHomeAssistantLightAvailability(),
  ]).then(([goXlrResult, lightResult]) => {
    if (activePort !== port || deviceConnectionId !== connectionId) return
    if (goXlrResult.status === 'fulfilled') {
      const status = goXlrResult.value
      sendGoXlrStatus(false, status.label, status.percent, status.muted)
    } else {
      report('goxlr-error', { message: String(goXlrResult.reason) })
    }
    if (lightResult.status === 'fulfilled' && lightResult.value) {
      const status = lightResult.value
      sendStatusBadge(1, false, status.label, status.percent, status.inactive)
    } else if (lightResult.status === 'rejected') {
      report('home-assistant-error', { message: String(lightResult.reason) })
    }
  })
}

// Third-party serial parsers run inside EventEmitter callbacks. Contain bad
// device packets here so one incompatible frame cannot terminate the agent.
process.on('uncaughtException', error => reportRuntimeError('uncaughtException', error))
process.on('unhandledRejection', error => reportRuntimeError('unhandledRejection', error))

function boundedTitle(value) {
  let result = ''
  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > TITLE_LIMIT) break
    result += character
  }
  return Buffer.from(result, 'utf8')
}

function displayArtist(value) {
  const minorWords = new Set(['and', 'in', 'of', 'the'])
  return value.split('-').filter(Boolean).map((word, index) =>
    index > 0 && minorWords.has(word) ? word : word[0].toUpperCase() + word.slice(1),
  ).join(' ')
}

function readVarint(buffer, offset) {
  let value = 0
  let shift = 0
  while (offset < buffer.length && shift < 64) {
    const byte = buffer[offset++]
    value += (byte & 0x7f) * (2 ** shift)
    if ((byte & 0x80) === 0) return [value, offset]
    shift += 7
  }
  throw new Error('Invalid LevelDB varint')
}

function decodeSnappy(source) {
  let [length, cursor] = readVarint(source, 0)
  const output = Buffer.allocUnsafe(length)
  let written = 0
  while (cursor < source.length && written < length) {
    const tag = source[cursor++]
    const kind = tag & 3
    let count
    let distance
    if (kind === 0) {
      count = tag >>> 2
      if (count < 60) count += 1
      else {
        const bytes = count - 59
        count = 0
        for (let index = 0; index < bytes; index++) count += source[cursor++] * (2 ** (index * 8))
        count += 1
      }
      source.copy(output, written, cursor, cursor + count)
      cursor += count
      written += count
      continue
    }
    if (kind === 1) {
      count = 4 + ((tag >>> 2) & 7)
      distance = ((tag & 0xe0) << 3) | source[cursor++]
    } else if (kind === 2) {
      count = 1 + (tag >>> 2)
      distance = source[cursor] | (source[cursor + 1] << 8)
      cursor += 2
    } else {
      count = 1 + (tag >>> 2)
      distance = source.readUInt32LE(cursor)
      cursor += 4
    }
    for (let index = 0; index < count; index++) output[written + index] = output[written - distance + index]
    written += count
  }
  if (written !== length) throw new Error('Incomplete Snappy block')
  return output
}

function readBlockHandle(buffer, offset = 0) {
  const [blockOffset, afterOffset] = readVarint(buffer, offset)
  const [size, afterSize] = readVarint(buffer, afterOffset)
  return [{ offset: blockOffset, size }, afterSize]
}

function readLevelBlock(table, handle) {
  const source = table.subarray(handle.offset, handle.offset + handle.size)
  const compression = table[handle.offset + handle.size]
  if (compression === 0) return source
  if (compression === 1) return decodeSnappy(source)
  throw new Error(`Unsupported LevelDB compression ${compression}`)
}

function readLevelEntries(block) {
  const restartCount = block.readUInt32LE(block.length - 4)
  const entriesEnd = block.length - 4 - restartCount * 4
  const entries = []
  let cursor = 0
  let key = Buffer.alloc(0)
  while (cursor < entriesEnd) {
    const [shared, afterShared] = readVarint(block, cursor)
    const [unshared, afterUnshared] = readVarint(block, afterShared)
    const [valueLength, afterLength] = readVarint(block, afterUnshared)
    cursor = afterLength
    key = Buffer.concat([key.subarray(0, shared), block.subarray(cursor, cursor + unshared)])
    cursor += unshared
    entries.push([key, block.subarray(cursor, cursor + valueLength)])
    cursor += valueLength
  }
  return entries
}

function readSstValues(path) {
  const table = readFileSync(path)
  const footer = table.subarray(table.length - 48)
  const [, afterMeta] = readBlockHandle(footer)
  const [indexHandle] = readBlockHandle(footer, afterMeta)
  const values = []
  for (const [, encodedHandle] of readLevelEntries(readLevelBlock(table, indexHandle))) {
    const [handle] = readBlockHandle(encodedHandle)
    for (const [, value] of readLevelEntries(readLevelBlock(table, handle))) values.push(value)
  }
  return values
}

function refreshPandoraCatalog(files) {
  const ldbFiles = files.filter(file => file.path.endsWith('.ldb'))
  const signature = ldbFiles.map(file => `${file.path}:${file.mtime}`).join('|')
  if (signature === pandoraCatalogSignature) return
  const marker = Buffer.from('playlistTracks', 'ascii')
  for (const file of ldbFiles) {
    const values = readSstValues(file.path).filter(value => value.includes(marker))
    if (values.length > 0) {
      pandoraCatalogValues = values
      pandoraCatalogSignature = signature
      return
    }
  }
}

function lookupPandoraTrack(token) {
  const marker = `\\"${token}\\":{\\"data\\":{`
  for (const value of pandoraCatalogValues) {
    const source = value.toString('utf8')
    const start = source.indexOf(marker)
    if (start < 0) continue
    const record = source.slice(start, start + 50000)
    const title = record.match(/songTitle\\":\\"([^"\\]+)/)?.[1]
    const artistToken = record.match(/artistSeoToken\\":\\"([^"\\]+)/)?.[1]
    const album = record.match(/albumTitle\\":\\"([^"\\]+)/)?.[1]
    if (title && artistToken) return {
      title,
      artist: displayArtist(artistToken.split('/')[0]),
      album: album ?? '',
    }
  }
  return null
}

function readPandoraNowPlaying() {
  if (!existsSync(PANDORA_LEVELDB)) return null
  const files = readdirSync(PANDORA_LEVELDB)
    .filter(name => /\.(?:ldb|log)$/.test(name))
    .map(name => ({ path: join(PANDORA_LEVELDB, name), mtime: statSync(join(PANDORA_LEVELDB, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  let currentToken
  for (const file of files) {
    let source
    try { source = readFileSync(file.path).toString('latin1') } catch { continue }
    const pointers = [...source.matchAll(/PLAYLIST_CURRENT_PLAYLIST\\":\\"(\d+)/g)]
    if (pointers.length === 0) continue
    const playlistId = pointers.at(-1)[1]
    const playlistStart = source.lastIndexOf(`\\"${playlistId}\\"`)
    const match = source.slice(playlistStart, playlistStart + 1800)
      .match(/PLAYLIST_CURRENT_TOKEN\\":\\"([^"\\]+)/)
    if (match) { currentToken = match[1]; break }
  }
  if (!currentToken) return null
  refreshPandoraCatalog(files)
  const track = lookupPandoraTrack(currentToken)
  // Pandora persists analytics payloads whose music_playing field can report
  // false during audible playback. A resolved current token is the reliable
  // signal available from its local store; avoid hiding live track metadata
  // based on the stale analytics flag.
  return track ? {
    ...track, isPlaying: true,
    observedMtime: Math.max(...files.map(file => file.mtime)),
  } : null
}

function publishNowPlaying() {
  const freshPandoraTrack = pandoraTrack &&
    pandoraTrack.observedMtime >= pandoraStartedAt - 1000
  const { observedMtime: _observedMtime, ...publicPandoraTrack } = pandoraTrack ?? {}
  const track = mediaSourceMode === 'chromecast' ? homeAssistantMediaTrack
    : (mediaSourceMode !== 'local' && (homeAssistantMediaTrack?.isPlaying || homeAssistantMediaTrack?.isPaused))
    ? homeAssistantMediaTrack
    : mediaSessionTrack?.isPlaying
    ? mediaSessionTrack
    : pandoraRunning && pandoraAudioActive && freshPandoraTrack
      ? { source: 'pandora', ...publicPandoraTrack } : null
  const oldText = nowPlayingState.title
    ? `${nowPlayingState.title}  -  ${nowPlayingState.artist}` : 'Now playing'
  const sourceLabel = { auto: 'Auto', local: 'Local PC', chromecast: 'Chromecast' }[mediaSourceMode]
  const showingSource = Date.now() < mediaSourceNoticeUntil
  const text = showingSource ? sourceLabel : (track ? track.displayText ??
    [track.title, track.artist].filter(Boolean).join('  -  ') : '')
  const stateKey = `${mediaSourceMode}:${track?.source}:${track?.isPlaying}:${track?.isPaused}:${text}`
  if (stateKey === lastNowPlaying) return
  nowPlayingState = track ? {
    ...track, changedAt: new Date().toISOString(),
  } : {
    source: '', title: '', artist: '', album: '', isPlaying: false,
    changedAt: new Date().toISOString(),
  }
  void persistNowPlayingState(nowPlayingState)
    .catch(error => reportRuntimeError('now-playing-state', error))
  lastNowPlaying = stateKey
  report('now-playing', nowPlayingState)
  if (!activePort) return
  const body = Buffer.from(text || oldText, 'utf8').subarray(0, 159)
  void queueDevicePacket(activePort, NOW_PLAYING, Buffer.concat([
    Buffer.from([showingSource || track ? 1 : 0]), body,
  ]))
}

function refreshPandoraNowPlaying() {
  try {
    pandoraTrack = readPandoraNowPlaying()
    publishNowPlaying()
  } catch (error) {
    reportRuntimeError('pandora-now-playing', error)
  }
}

function startMediaSessionReader() {
  if (shuttingDown || !coreStarted) return
  mediaSessionReader = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', mediaSessionReaderPath,
  ], { windowsHide: true })
  const lines = readline.createInterface({ input: mediaSessionReader.stdout })
  lines.on('line', line => {
    try {
      const state = JSON.parse(line)
      pandoraRunning = Boolean(state.pandoraRunning)
      pandoraStartedAt = state.pandoraStartedAt
        ? Date.parse(state.pandoraStartedAt) : 0
      pandoraAudioActive = Boolean(state.pandoraAudioActive)
      if (state.media?.title) {
        const isPlex = /plex/i.test(state.media.source)
        const episode = isPlex
          ? /^(.*?)\s+S(\d+)E(\d+)$/i.exec(state.media.subtitle ?? '') : null
        const series = episode?.[1]?.trim() ?? ''
        const season = episode ? Number(episode[2]) : null
        const episodeNumber = episode ? Number(episode[3]) : null
        mediaSessionTrack = {
          source: isPlex ? 'plex' : 'windows-media',
          title: state.media.title,
          artist: state.media.artist ?? '',
          album: state.media.album ?? '',
          subtitle: state.media.subtitle ?? '',
          mediaType: state.media.playbackType?.toLowerCase() ?? '',
          series, season, episode: episodeNumber,
          seriesTitle: series, seasonNumber: season, episodeNumber,
          displayText: series
            ? `${series} S${season}E${episodeNumber}  -  ${state.media.title}`
            : [state.media.title, state.media.artist].filter(Boolean).join('  -  '),
          isPlaying: true,
        }
      } else mediaSessionTrack = null
      publishNowPlaying()
    } catch (error) {
      reportRuntimeError('media-session-state', error)
    }
  })
  mediaSessionReader.stderr.on('data', data =>
    reportRuntimeError('media-session-reader', data.toString().trim()))
  mediaSessionReader.on('exit', () => {
    mediaSessionReader = undefined
    if (!shuttingDown && coreStarted) setTimeout(startMediaSessionReader, 2000).unref()
  })
}

function loadProfile() {
  loadHomeAssistantConfig()
  registerBuiltInCuePlugins()
  loadUserCuePlugins()
  let config
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    report('profile-reload-rejected', { message: `Invalid config: ${String(error)}` })
    return false
  }
  const nextVisualPreferences = normalizeVisualPreferences(config?.visualPreferences)
  const layer = config?.deviceLayout?.layers?.[0] ?? []
  const nextMappings = new Map(layer.map(([eventName, cueId]) =>
    [eventName, cueId.replaceAll('\\', '/')]))
  const nextModules = new Map()
  // The firmware retains its current collection across a profile reload. Keep
  // the matching host session so select/activate events remain actionable.
  const retainedCarousel = carouselSessions.active

  for (const cueId of new Set(nextMappings.values())) {
    const cuePath = join(cuesRoot, ...cueId.split('/'))
    try {
      delete requireFromCtrl.cache?.[requireFromCtrl.resolve(cuePath)]
      const cue = requireFromCtrl(cuePath)
      cue.plugins ??= {}
      installCuePlugins(cue, cueId)
      cue.setup?.()
      nextModules.set(cueId, cue)
    } catch (error) {
      report('profile-reload-rejected', { cueId, message: String(error) })
      disposeCueSet(nextModules)
      return false
    }
  }
  const previousModules = new Map(modules)
  visualPreferences = nextVisualPreferences
  mappings = nextMappings
  modules.clear()
  for (const [cueId, cue] of nextModules) modules.set(cueId, cue)
  disposeCueSet(previousModules)
  report('reloaded', {
    cueCount: modules.size,
    mappingCount: mappings.size,
    retainedCarousel: retainedCarousel?.id ?? null,
    retainedCarouselSessionId: retainedCarousel?.wireSessionId ?? null,
  })
  void refreshHomeAssistantMediaPlayer().catch(error =>
    report('home-assistant-media-refresh-error', { message: String(error) }))
  return true
}

function normalizeVisualColor(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
}

function normalizeVisualPreferences(value) {
  return {
    splashImageId: [0, 1, 2].includes(Number(value?.splashImageId))
      ? Number(value.splashImageId) : 0,
    ledColor: normalizeVisualColor(value?.ledColor, '#d83a04'),
    usbConnectedColor: normalizeVisualColor(value?.usbConnectedColor, '#d83a04'),
    usbDisconnectedColor: normalizeVisualColor(value?.usbDisconnectedColor, '#481808'),
  }
}

function visualColorBytes(value) {
  return [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16))
}

function syncVisualPreferences(port = activePort) {
  if (!port || !visualPreferences) return
  void queueDevicePacket(port, DEVICE_VISUALS, Buffer.from([
    1,
    visualPreferences.splashImageId,
    ...visualColorBytes(visualPreferences.ledColor),
    ...visualColorBytes(visualPreferences.usbConnectedColor),
    ...visualColorBytes(visualPreferences.usbDisconnectedColor),
  ]))
}

function collectionInputBinding() {
  let dialIndex
  let buttonIndex
  for (const [eventName, cueId] of mappings) {
    const cue = modules.get(cueId)
    const isCollection = cue?.requiredComponents?.includes('collection-view')
    if (!isCollection) continue
    const dialMatch = /^sensor-(\d+)-dial-(?:increment|decrement)$/.exec(eventName)
    const buttonMatch = /^sensor-(\d+)-button-pressed$/.exec(eventName)
    if (dialMatch) dialIndex = Number(dialMatch[1])
    if (buttonMatch) buttonIndex = Number(buttonMatch[1])
  }
  return Number.isInteger(dialIndex) && Number.isInteger(buttonIndex)
    ? { dialIndex, buttonIndex } : undefined
}

function syncCollectionInputBinding(port = activePort) {
  const binding = collectionInputBinding()
  if (!port || !binding) return
  void queueDevicePacket(port, COLLECTION_INPUT_BINDING,
    Buffer.from([binding.dialIndex, binding.buttonIndex]))
}

function requiredRuntimeAssets() {
  const resolved = new Map()
  const names = new Set()
  for (const cue of modules.values()) {
    for (const asset of Array.isArray(cue.runtimeAssets) ? cue.runtimeAssets : []) {
      if (!asset || typeof asset.name !== 'string' || !Number.isInteger(asset.id) ||
          !Number.isInteger(asset.format) || !Number.isInteger(asset.width) ||
          !Number.isInteger(asset.height) || !Buffer.isBuffer(asset.data)) {
        report('cue-asset-invalid', { name: asset?.name })
        continue
      }
      resolved.set(asset.id, { ...asset, cueOwned: true })
    }
    for (const name of Array.isArray(cue.requiredAssets) ? cue.requiredAssets : []) names.add(name)
    if (typeof cue.glyph === 'string') {
      names.add(cue.glyph.includes('.') ? cue.glyph : `media.${cue.glyph}`)
    }
  }
  for (const name of names) {
    const asset = runtimeAssetForName(name)
    if (asset && !resolved.has(asset.id)) resolved.set(asset.id, asset)
  }
  return [...resolved.values()]
}

async function syncRuntimeAssets(port, connectionId) {
  const assets = requiredRuntimeAssets()
  for (const asset of assets) {
    if (!isCurrentDeviceSession(port, connectionId)) return false
    const begin = Buffer.allocUnsafe(6)
    begin[0] = asset.id; begin[1] = asset.format
    begin[2] = asset.width; begin[3] = asset.height
    begin.writeUInt16BE(asset.data.length, 4)
    try {
      await sendConfirmedCachePacket(port, ASSET_BEGIN, begin)
    } catch (error) {
      report('runtime-asset-begin-error', { assetId: asset.id, message: String(error) })
      return false
    }
    // Large assets use the normal chunk protocol. This keeps cue visuals
    // generic and lets Ctrl preload all active glyphs when the device connects.
    for (let offset = 0; offset < asset.data.length; offset += 220) {
      const data = asset.data.subarray(offset, offset + 220)
      const chunk = Buffer.allocUnsafe(2 + data.length)
      chunk.writeUInt16BE(offset, 0); data.copy(chunk, 2)
      if (!await queueWirePacket(port, ASSET_CHUNK, chunk)) return false
      await new Promise(resolve => setTimeout(resolve, INITIAL_PACKET_GAP_MS))
    }
    try {
      await sendConfirmedCachePacket(port, ASSET_COMMIT)
    } catch (error) {
      report('runtime-asset-commit-error', { assetId: asset.id, message: String(error) })
      return false
    }
  }
  report('runtime-assets-synced', {
    assetIds: assets.map(asset => asset.id),
    cueOwned: assets.filter(asset => asset.cueOwned).map(asset => asset.name),
  })
  return true
}

async function runCue(eventData) {
  const carouselTurn = /^sensor-(\d+)-dial-(?:increment|decrement)$/.exec(eventData.event)
  if (carouselTurn && carouselSessions.active &&
      Number(carouselTurn[1]) === carouselSessions.active.input.dial) {
    // Firmware owns navigation after the opening cue commits its collection.
    // Reopening here resets the collection on every physical turn.
    report('carousel-input-delegated', { input: eventData.event,
      sessionId: carouselSessions.active.wireSessionId, id: carouselSessions.active.id })
    return
  }
  const cueId = mappings.get(eventData.event)
  const cue = cueId ? modules.get(cueId) : undefined
  if (!cue?.run) {
    report('cue-unmapped', { input: eventData.event })
    return
  }
  const glyphId = runtimeAssetForName(cue.glyph, cue)?.id ?? OVERLAY_GLYPHS.get(cue.glyph)
  if (glyphId && activePort) {
    void queueDevicePacket(activePort, ACTION_GLYPH, Buffer.from([glyphId]), { priority: 0 })
    report('cue-glyph', { cueId, input: eventData.event, glyph: cue.glyph })
  }
  try {
    await cue.run(eventData)
    report('cue-ran', { cueId, input: eventData.event })
  } catch (error) {
    report('cue-error', { cueId, message: String(error) })
  }
}

function capture(text, key) {
  return new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(text)?.[1] ?? ''
}

async function discoverSteamGames() {
  const steamRoot = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam')
  const libraryFile = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  const libraries = new Set([steamRoot])
  if (existsSync(libraryFile)) {
    const contents = await readFile(libraryFile, 'utf8')
    for (const match of contents.matchAll(/"path"\s+"([^"]+)"/gi)) {
      libraries.add(match[1].replaceAll('\\\\', '\\'))
    }
  }

  const found = []
  // Steam records some desktop utilities as installed apps; they are not useful
  // in a game-launch carousel even though they have valid Steam manifests.
  const excludedAppIds = new Set(['227260', '388080'])
  const excludedNames = new Set(['displayfusion', 'borderless gaming'])
  for (const library of libraries) {
    const steamApps = join(library, 'steamapps')
    if (!existsSync(steamApps)) continue
    for (const file of await readdir(steamApps)) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
      const manifest = await readFile(join(steamApps, file), 'utf8')
      const appId = capture(manifest, 'appid')
      const name = capture(manifest, 'name')
      if (!appId || !name || capture(manifest, 'StateFlags') !== '4') continue
      if (excludedAppIds.has(appId) || excludedNames.has(name.trim().toLowerCase())) continue
      const artworkPath = await findSteamArtwork(join(steamRoot, 'appcache', 'librarycache', appId))
      found.push({ appId, name, lastPlayed: Number(capture(manifest, 'LastPlayed')) || 0, artworkPath })
    }
  }
  return found.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name)).slice(0, GAME_LIMIT)
}

async function findSteamArtwork(cacheFolder) {
  if (!existsSync(cacheFolder)) return ''
  const candidates = []

  async function scan(folder, depth) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory() && depth > 0) {
        await scan(path, depth - 1)
      } else if (entry.isFile() && /\.(jpg|jpeg|png)$/i.test(entry.name)) {
        const name = entry.name.toLowerCase()
        const priority = name === 'library_600x900.jpg' ? 5
          : name === 'library_capsule.jpg' ? 4
            : name === 'library_header.jpg' ? 3
              : name === 'logo.png' ? 1 : 2
        candidates.push({ path, priority, size: (await stat(path)).size })
      }
    }
  }

  await scan(cacheFolder, 2)
  candidates.sort((left, right) => right.priority - left.priority || right.size - left.size)
  return candidates[0]?.path ?? ''
}

function fallbackArtwork(game) {
  const result = Buffer.alloc(ART_SIZE * ART_SIZE * 2)
  let seed = Number(game.appId) || 1
  for (const character of game.name) seed = ((seed * 31) ^ character.charCodeAt(0)) >>> 0
  const accentRed = 180 + (seed & 63)
  const accentGreen = 45 + ((seed >> 6) & 63)

  for (let y = 0; y < ART_SIZE; y++) {
    for (let x = 0; x < ART_SIZE; x++) {
      const inset = Math.min(x, y, ART_SIZE - 1 - x, ART_SIZE - 1 - y)
      const diagonal = Math.abs(x - y) < 4 || Math.abs(x + y - ART_SIZE + 1) < 4
      const framed = inset < 4 || (inset > 15 && inset < 20) || diagonal
      const red = framed ? accentRed : 7 + Math.floor(y / 8)
      const green = framed ? accentGreen : 14 + Math.floor(x / 12)
      const blue = framed ? 18 : 24 + Math.floor((x + y) / 12)
      result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), (y * ART_SIZE + x) * 2)
    }
  }
  return result
}

function cachedArtwork(game) {
  const existing = artworkCache.get(game.appId)
  if (existing) return existing
  const pending = (async () => {
    const cacheRoot = join(appData, 'game-art-cache')
    const cachePath = join(cacheRoot, `${game.appId}-${ART_SIZE}-${ART_CACHE_VERSION}.rgb565`)
    if (existsSync(cachePath)) {
      const cached = await readFile(cachePath)
      if (cached.length === ART_SIZE * ART_SIZE * 2) return cached
    }
    let result = fallbackArtwork(game)
    if (game.artworkPath) {
      try {
        Jimp ??= requireFromCtrl('jimp')
        const image = await Jimp.read(game.artworkPath)
        image.background(0x08121aff).contain(
          ART_SIZE,
          ART_SIZE,
          Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE,
        )
        result = Buffer.alloc(ART_SIZE * ART_SIZE * 2)
        for (let index = 0; index < ART_SIZE * ART_SIZE; index++) {
          const red = image.bitmap.data[index * 4]
          const green = image.bitmap.data[index * 4 + 1]
          const blue = image.bitmap.data[index * 4 + 2]
          result.writeUInt16BE(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3), index * 2)
        }
      } catch (error) {
        report('artwork-error', { appId: game.appId, path: game.artworkPath, message: String(error) })
      }
    }
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(cachePath, result)
    return result
  })()
  artworkCache.set(game.appId, pending)
  return pending
}

async function prewarmArtworkCache() {
  let sourceCount = 0
  let fallbackCount = 0
  for (const game of games) {
    if (shuttingDown) return
    await artworkAssetStore.prepare(
      `steam/${game.appId}`,
      () => cachedArtwork(game),
    )
    if (game.artworkPath) sourceCount++
    else fallbackCount++
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  report('artwork-ready', {
    gameCount: games.length,
    sourceCount,
    fallbackCount,
    artworkStore: artworkAssetStore.snapshot(),
  })
}

async function refreshCarouselSources() {
  if (carouselSourceRefresh) return carouselSourceRefresh
  carouselSourceRefresh = (async () => {
    const steamRefresh = discoverSteamGames().then(async refreshedGames => {
      games = refreshedGames
      await prewarmArtworkCache()
    })
    const plexRefresh = prewarmPlexContinueWatchingCache(true)
    const results = await Promise.allSettled([steamRefresh, plexRefresh])
    report('carousel-sources-refreshed', {
      steam: games.length,
      plex: plexCollection.items.length,
    })
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
  })().finally(() => { carouselSourceRefresh = undefined })
  return carouselSourceRefresh
}

async function sendArtwork(game, gameIndex, slot, transferId, priority = 1) {
  const port = activePort
  if (!port || transferId !== artworkTransferId) return
  legacyArtworkResidency.clear(slot)
  const assetKey = await artworkAssetStore.prepare(
    `steam/${game.appId}`,
    () => cachedArtwork(game),
  )
  const session = carouselSessions.active
  if (port === activePort && transferId === artworkTransferId && session?.id === 'steam') {
    if (await queueDirectArtwork(session, slot, gameIndex, game.name, assetKey, priority) &&
        transferId === artworkTransferId) legacyArtworkResidency.bind(slot, `steam:${gameIndex}`)
  }
}

async function sendArtworkWindow(centerIndex, transferId) {
  if (transferId !== artworkTransferId || !activePort) return
  if (centerIndex < 0 || centerIndex >= games.length) return
  lastArtworkCenterIndex = centerIndex
  const windowSize = requestedArtworkWindowSize
  const orderedOffsets = (centerIndex === 0 && windowSize === 3
    ? [0, 1, 2] : [0, -1, 1, -2, 2, -3, 3]).slice(0, windowSize)

  const desired = [...new Set(orderedOffsets.map(
    offset => (centerIndex + offset + games.length) % games.length,
  ))]

  for (const gameIndex of desired) {
    if (transferId !== artworkTransferId || !activePort) return
    if (requestedArtworkCenter !== null && requestedArtworkCenter !== centerIndex) return
    if (legacyArtworkResidency.has(`steam:${gameIndex}`)) continue
    const slot = legacyArtworkResidency.findSlot(
      entry => entry === null || !desired.includes(Number(entry?.replace('steam:', ''))),
    )
    if (slot < 0) return
    await sendArtwork(games[gameIndex], gameIndex, slot, transferId,
      gameIndex === centerIndex ? 0 : 1)
  }
  if (transferId === artworkTransferId && activePort) {
    report('artwork-window-complete', {
      centerAppId: games[centerIndex].appId,
      centerTitle: games[centerIndex].name,
      windowSize,
    })
  }
}

async function runArtworkWorker() {
  if (artworkWorkerRunning) return
  artworkWorkerRunning = true
  const transferId = artworkTransferId
  try {
    while (transferId === artworkTransferId && activePort &&
           requestedArtworkCenter !== null) {
      const centerIndex = requestedArtworkCenter
      const windowSize = requestedArtworkWindowSize
      await sendArtworkWindow(centerIndex, transferId)
      if (windowSize === 3 && requestedArtworkCenter === centerIndex &&
          deviceCacheProtocolVersion < CACHE_PROTOCOL_VERSION) {
        // The first three are interactive priority; then use already-prepared
        // host RAM to fill the rest of the forward window in the background.
        requestedArtworkWindowSize = 7
        await sendArtworkWindow(centerIndex, transferId)
      }
      if (requestedArtworkCenter === centerIndex) requestedArtworkCenter = null
    }
  } finally {
    artworkWorkerRunning = false
    if (requestedArtworkCenter !== null && activePort) void runArtworkWorker()
  }
}

function queueSelectedArtwork(appId) {
  const gameIndex = games.findIndex(candidate => candidate.appId === appId)
  if (gameIndex < 0) return
  requestedArtworkCenter = gameIndex
  requestedArtworkWindowSize = deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION ? 3 : 7
  clearTimeout(artworkTimer)
  artworkTimer = setTimeout(() => {
    report('artwork-window-start', {
      centerAppId: games[gameIndex].appId,
      centerTitle: games[gameIndex].name,
    })
    void runArtworkWorker()
  }, 20)
  artworkTimer.unref()
}

function queueInitialArtwork() {
  if (games.length === 0) return
  if (initialArtworkQueued) return
  initialArtworkQueued = true
  const transferId = ++artworkTransferId
  clearTimeout(artworkTimer)
  artworkTimer = setTimeout(() => {
    if (transferId !== artworkTransferId) return
    requestedArtworkCenter = 0
    requestedArtworkWindowSize = 3
    report('artwork-window-start', {
      centerAppId: games[0].appId,
      centerTitle: games[0].name,
      initial: true,
    })
    void runArtworkWorker()
  }, ARTWORK_SETTLE_MS)
  artworkTimer.unref()
}

async function sendArtworkIdleWindow(centerIndex, transferId) {
  if (transferId !== artworkTransferId || !activePort) return
  if (centerIndex < 0 || centerIndex >= games.length) return

  const desired = [...new Set([0, -1, 1].map(
    offset => (centerIndex + offset + games.length) % games.length,
  ))]

  for (const gameIndex of desired) {
    if (transferId !== artworkTransferId || !activePort) return
    if (legacyArtworkResidency.has(`steam:${gameIndex}`)) continue
    const slot = legacyArtworkResidency.findSlot(
      entry => entry === null || !desired.includes(Number(entry?.replace('steam:', ''))),
    )
    if (slot < 0) return
    await sendArtwork(games[gameIndex], gameIndex, slot, transferId, 2)
  }
}

function isCurrentDeviceSession(port, connectionId) {
  return activePort === port && deviceConnectionId === connectionId
}

async function syncGameList(port, connectionId) {
  if (games.length === 0) return true
  if (!isCurrentDeviceSession(port, connectionId) ||
      !await queueDevicePacket(port, GAME_LIST_BEGIN, Buffer.from([games.length]), { priority: 0 })) return false
  for (const game of games) {
    if (!isCurrentDeviceSession(port, connectionId)) return false
    const appId = Buffer.from(game.appId, 'ascii')
    const title = boundedTitle(game.name)
    const body = Buffer.allocUnsafe(2 + appId.length + title.length)
    body[0] = appId.length
    body[1] = title.length
    appId.copy(body, 2)
    title.copy(body, 2 + appId.length)
    if (!await queueDevicePacket(port, GAME_LIST_ITEM, body, { priority: 0 })) return false
    await new Promise(resolve => setTimeout(resolve, INITIAL_PACKET_GAP_MS))
  }
  return isCurrentDeviceSession(port, connectionId) &&
    await queueDevicePacket(port, GAME_LIST_COMMIT, Buffer.alloc(0), { priority: 0 })
}

function createSteamCarouselSession(input) {
  return {
    id: 'steam',
    input,
    items: games.map(game => ({ itemId: game.appId, title: game.name, game,
      artworkIdentity: `steam/${game.appId}` })),
    loadArtwork: item => queueSelectedArtwork(item.itemId),
    activate: item => activateSteamCarouselItem(item.itemId),
    preload: () => queueInitialArtwork(),
  }
}

async function prewarmLocalCarouselArtwork() {
  const steam = games.slice(0, 3)
  const plex = (await refreshPlexContinueWatchingCache()).slice(0, 3)
  for (const game of steam) {
    await cachedArtwork(game)
  }
  for (const item of plex) {
    await plexCollectionArtwork(item)
  }
  report('local-carousel-artwork-prewarm-complete', { steam: steam.length, plex: plex.length })
}

async function primeDeviceCarouselArtwork() {
  const port = activePort
  if (!port || deviceCacheProtocolVersion < CACHE_PROTOCOL_VERSION) return
  const steam = games.slice(0, 3)
  const plex = (await refreshPlexContinueWatchingCache()).slice(0, 3)
  for (const game of steam) {
    if (port !== activePort) return
    const assetKey = await artworkAssetStore.prepare(
      `steam/${game.appId}`, () => cachedArtwork(game))
    const lease = artworkAssetStore.lease(assetKey)
    if (!lease) continue
    try { await ensureDeviceAsset(assetKey, lease.bytes) } finally { lease.release() }
  }
  for (const item of plex) {
    if (port !== activePort) return
    const assetKey = await artworkAssetStore.prepare(
      `plex/${item.itemId}`, () => plexCollectionArtwork(item))
    const lease = artworkAssetStore.lease(assetKey)
    if (!lease) continue
    try { await ensureDeviceAsset(assetKey, lease.bytes) } finally { lease.release() }
  }
  report('device-carousel-artwork-primed', { steam: steam.length, plex: plex.length })
}

function activateSteamCarouselItem(appId) {
  if (!/^\d+$/.test(appId) || !games.some(game => game.appId === appId)) return
  spawn('explorer.exe', [`steam://run/${appId}`], { detached: true, stdio: 'ignore' }).unref()
  report('steam-carousel-activated', { appId })
}

async function initializeDeviceSession(port, connectionId) {
  await new Promise(resolve => setTimeout(resolve, INITIAL_SYNC_DELAY_MS))
  if (!isCurrentDeviceSession(port, connectionId)) return

  syncVisualPreferences(port)
  // Collection routing is transient firmware state and must be restored on
  // every connection, not only when a carousel is first opened.
  syncCollectionInputBinding(port)
  // These startup operations are independent. Dispatch them together so the
  // home-screen zones become visible as one initial state instead of waiting
  // behind glyph/art uploads or artificial inter-packet delays.
  const capabilitySync = queueDevicePacket(port, RUNTIME_CAPABILITIES,
    Buffer.alloc(0), { priority: 0 })
  const runtimeAssetSync = syncRuntimeAssets(port, connectionId)
  const statusSync = preloadActiveStatusZones()
  const results = await Promise.allSettled([capabilitySync, runtimeAssetSync, statusSync])
  if (!isCurrentDeviceSession(port, connectionId)) return
  if (results[1].status === 'fulfilled' && results[1].value === false) return
  if (results[0].status === 'rejected') {
    report('runtime-capability-sync-error', { message: String(results[0].reason) })
  }
  if (results[1].status === 'rejected') {
    report('runtime-asset-sync-error', { message: String(results[1].reason) })
  }
  // A Teensy can enumerate twice during a cold reconnect. If the first
  // status batch raced that transient disconnect, resend it after the port
  // has had time to settle without delaying the initial parallel dispatch.
  setTimeout(() => {
    if (isCurrentDeviceSession(port, connectionId)) {
      void preloadActiveStatusZones()
    }
  }, 750).unref()
  lastNowPlaying = ''
  refreshPandoraNowPlaying()
  await new Promise(resolve => setTimeout(resolve, 100))
  if (!isCurrentDeviceSession(port, connectionId)) return
  report('device-sync-complete', { port: port.devicePath })
  void prewarmLocalCarouselArtwork().catch(error =>
    report('local-carousel-artwork-prewarm-error', { message: String(error) }))
}

function attachPort(fp) {
  wireScheduler.beginEpoch()
  const port = serial.Ports[fp.deviceSerial]
  const connectionId = ++deviceConnectionId
  activePort = port
  activeDeviceFingerprint = {
    devicePath: String(fp.devicePath ?? ''),
    portId: String(fp.portId ?? ''),
    deviceSerial: String(fp.deviceSerial ?? ''),
  }
  const parseFirmwarePacket = port.parseSlipPacketHeader.bind(port)
  port.parseSlipPacketHeader = packet => {
    const capabilities = parseDeviceCapabilities(packet)
    if (capabilities) {
      deviceCapabilities = capabilities
      deviceCacheProtocolVersion = capabilities.cacheProtocol
      advertisedDeviceCacheBytes = capabilities.cacheBytes
      report('device-capabilities', capabilities)
      if (deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION) {
        void primeDeviceCarouselArtwork().catch(error =>
          report('device-carousel-artwork-prime-error', { message: String(error) }))
      }
    }
    // The bundled serial wrapper logs ERROR but discards its request/error
    // bytes. Preserve them here so cache faults can be diagnosed remotely.
    if (packet?.[0] === 4) {
      firmwareAcks.reject(packet[1], `Firmware rejected cache packet ${packet[1]} with error ${packet[2]}`, {
        epoch: connectionId, transactionId: packet.length >= 5 ? (packet[3] << 8) | packet[4] : 0,
      })
      report('firmware-protocol-error', {
        request: packet[1],
        error: packet[2],
      })
    }
    firmwareAcks.accept(packet, { epoch: connectionId })
    return parseFirmwarePacket(packet)
  }
  // Firmware ERROR packets were previously only visible in the serial
  // wrapper's debug stream, which made cache-render failures opaque.
  port.on(serial.SerialEvents.Log.debug, payload => {
    const message = String(payload?.message ?? '')
    if (/Got ERROR from MakeShift|Got ACK from MakeShift/i.test(message)) {
      report('firmware-protocol', { message })
    }
  })
  for (const [buttonIndex, event] of serial.DeviceEvents.BUTTON.entries()) {
    port.on(event.PRESSED, payload => {
      captureInputEdge(buttonIndex, 'pressed', payload)
      const shortEvent = `sensor-${buttonIndex}-button-short-pressed`
      const longEvent = `sensor-${buttonIndex}-button-long-pressed`
      if (mappings.has(shortEvent) || mappings.has(longEvent)) {
        const longCue = modules.get(mappings.get(longEvent))
        const holdMs = Number(longCue?.holdMs)
        const pressDuration = Number.isFinite(holdMs) && holdMs >= 250 &&
          holdMs <= 10000 ? holdMs : BUTTON_LONG_PRESS_MS
        const gesture = { longFired: false, timer: setTimeout(() => {
          gesture.longFired = true
          if (mappings.has(longEvent)) runCue({ ...payload, event: longEvent })
        }, pressDuration) }
        buttonGestures.set(buttonIndex, gesture)
        return
      }
      if (buttonIndex === 3 && !mappings.has(payload.event)) {
        queueGoXlr(selectNextGoXlrChannel)
      } else {
        runCue(payload)
      }
    })
    port.on(event.RELEASED, payload => {
      captureInputEdge(buttonIndex, 'released', payload)
      const gesture = buttonGestures.get(buttonIndex)
      if (gesture) {
        clearTimeout(gesture.timer)
        buttonGestures.delete(buttonIndex)
        const shortEvent = `sensor-${buttonIndex}-button-short-pressed`
        if (!gesture.longFired && mappings.has(shortEvent)) {
          runCue({ ...payload, event: shortEvent })
        }
      }
      runCue(payload)
    })
  }
  for (const event of serial.DeviceEvents.DIAL) {
    port.on(event.INCREMENT, payload => {
      report('rotary-input', { input: payload.event, direction: 'increment' })
      void runCue(payload)
    })
    port.on(event.DECREMENT, payload => {
      report('rotary-input', { input: payload.event, direction: 'decrement' })
      void runCue(payload)
    })
  }
  port.on(serial.DeviceEvents.SERIAL.MESSAGE, message => {
    if (message.startsWith('MKDBG ')) {
      if (Date.now() <= inputCaptureUntil) report('firmware-trace', { message })
    } else if (message.startsWith('MKSHFT_LED ')) {
      indicatorSupported = /\bindicator=1\b/.test(message)
      syncMediaSourceIndicator()
    } else if (message.startsWith('MKSHFT_CACHE ') && !deviceCapabilities) {
      const bytes = Number(/\bbytes=(\d+)/.exec(message)?.[1])
      const protocol = Number(/\bprotocol=(\d+)/.exec(message)?.[1])
      if (Number.isInteger(bytes) && bytes > 0) {
        advertisedDeviceCacheBytes = bytes
        deviceCacheProtocolVersion = Number.isInteger(protocol) ? protocol : 0
        report('device-cache-capabilities', {
          bytes, protocol: deviceCacheProtocolVersion, message,
        })
        if (deviceCacheProtocolVersion >= CACHE_PROTOCOL_VERSION) {
          void primeDeviceCarouselArtwork().catch(error =>
            report('device-carousel-artwork-prime-error', { message: String(error) }))
        }
      }
    } else if (message.startsWith('MKSHFT_CACHE_EVICT ')) {
      const key = Number(/\bkey=(\d+)/.exec(message)?.[1])
      if (Number.isInteger(key) && key > 0) {
        deviceAssetKeys.delete(key)
        // Legacy residency is only a binding hint. An actual device eviction
        // invalidates that hint, otherwise a later selection skips its upload.
        legacyArtworkResidency.reset()
        report('device-cache-evicted', { key })
      }
    } else if (message.startsWith('GAME_SELECT:')) {
      const itemId = message.slice('GAME_SELECT:'.length).trim()
      const session = carouselSessions.active
      const item = session?.items.find(candidate => candidate.itemId === itemId)
      if (!item || !session?.loadArtwork) {
        report('carousel-select-ignored', { id: session?.id ?? null, itemId })
      } else {
        report('carousel-selected', { id: session.id, itemId, title: item.title })
        void Promise.resolve(session.loadArtwork(item)).catch(error =>
          report('carousel-select-error', { id: session.id, itemId, message: String(error) }))
      }
    } else if (message.startsWith('COLLECTION_SELECT:')) {
      const [sessionText, itemId] = message.slice('COLLECTION_SELECT:'.length).trim().split(':', 2)
      const sessionId = Number(sessionText)
      const session = carouselSessions.active
      const item = session?.wireSessionId === sessionId
        ? session.items.find(candidate => candidate.itemId === itemId) : null
      if (!item || !session?.loadArtwork) {
        report('carousel-select-ignored', { id: session?.id ?? null, sessionId, activeSessionId: session?.wireSessionId ?? null, itemId })
      } else {
        report('carousel-selected', { id: session.id, sessionId, itemId, title: item.title })
        void Promise.resolve(session.loadArtwork(item)).catch(error =>
          report('carousel-select-error', { id: session.id, itemId, message: String(error) }))
      }
    } else if (message === 'GAME_PRELOAD_FIRST') {
      const session = carouselSessions.active
      if (session?.preload) void Promise.resolve(session.preload()).catch(error =>
        report('carousel-preload-error', { id: session.id, message: String(error) }))
    } else if (message.startsWith('GAME_LAUNCH:')) {
      const itemId = message.slice('GAME_LAUNCH:'.length).trim()
      const session = carouselSessions.active
      const item = session?.items.find(candidate => candidate.itemId === itemId)
      if (!item || !session?.activate) {
        report('carousel-activate-ignored', { id: session?.id ?? null, itemId })
      } else {
        report('carousel-activate-requested', { id: session.id, itemId, title: item.title })
        void Promise.resolve(session.activate(item)).catch(error =>
          report('carousel-activate-error', { id: session.id, itemId, message: String(error) }))
      }
    } else if (message.startsWith('COLLECTION_ACTIVATE:')) {
      const [sessionText, itemId] = message.slice('COLLECTION_ACTIVATE:'.length).trim().split(':', 2)
      const sessionId = Number(sessionText)
      const session = carouselSessions.active
      const item = session?.wireSessionId === sessionId
        ? session.items.find(candidate => candidate.itemId === itemId) : null
      if (!item || !session?.activate) {
        report('carousel-activate-ignored', { id: session?.id ?? null, sessionId, activeSessionId: session?.wireSessionId ?? null, itemId })
      } else {
        report('carousel-activate-requested', { id: session.id, sessionId, itemId, title: item.title })
        void Promise.resolve(session.activate(item)).catch(error =>
          report('carousel-activate-error', { id: session.id, itemId, message: String(error) }))
      }
    } else if (message.startsWith('COLLECTION_PRELOAD_FIRST:')) {
      const sessionId = Number(message.slice('COLLECTION_PRELOAD_FIRST:'.length))
      const session = carouselSessions.active
      if (session?.wireSessionId !== sessionId) {
        report('carousel-preload-ignored', { sessionId, activeSessionId: session?.wireSessionId ?? null })
      } else if (session.preload) void Promise.resolve(session.preload()).catch(error =>
        report('carousel-preload-error', { id: session.id, message: String(error) }))
    } else if (message === 'GOXLR_NEXT') {
      queueGoXlr(selectNextGoXlrChannel)
    } else if (message === 'GOXLR_MUTE_TOGGLE') {
      queueGoXlr(toggleGoXlrMute)
    } else if (message.startsWith('GOXLR_ADJUST:')) {
      const delta = Number.parseInt(message.slice('GOXLR_ADJUST:'.length), 10)
      if (Number.isFinite(delta) && delta !== 0) queueGoXlr(() => adjustGoXlrChannel(delta))
    }
  })
  report('connected', { port: fp.devicePath })
  void initializeDeviceSession(port, connectionId)
    .catch(error => reportRuntimeError('device-initial-sync', error))
}

function detachPort() {
  ++deviceConnectionId
  ++artworkTransferId
  requestedArtworkCenter = null
  clearTimeout(artworkTimer)
  for (const gesture of buttonGestures.values()) clearTimeout(gesture.timer)
  buttonGestures.clear()
  relativeSeek.clear()
  activePort = undefined
  activeDeviceFingerprint = null
  firmwareAcks.clear()
  legacyArtworkResidency.reset()
  deviceAssetKeys.clear()
  deviceCacheProtocolVersion = 0
  deviceCapabilities = null
  indicatorSupported = false
  initialArtworkQueued = false
  carouselSessions.clear()
  plexCollection.active = false
  resetPlexCollectionArtworkSlots()
  report('disconnected')
}

function yieldSerial() {
  if (!serialLifecycle.yield()) return
  activePort = undefined
}

function resumeSerial() {
  serialLifecycle.resume()
}

function resetSerialScan(reason) {
  serialLifecycle.resetScan(reason, { connected: Boolean(activePort), shuttingDown })
}

function runFirmwareLoader() {
  return new Promise((resolve, reject) => {
    const usePythonModule = platformioExecutable === 'platformio.exe'
    const command = usePythonModule ? 'py' : platformioExecutable
    const args = usePythonModule
      ? ['-m', 'platformio', 'run', '-t', 'upload']
      : ['run', '-t', 'upload']
    const child = spawn(command, args,
      { cwd: firmwareRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Firmware upload timed out after 120 seconds'))
    }, 120000)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timeout)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error([stdout, stderr].filter(Boolean).join('\n') ||
        `Teensy loader exited ${code}`))
    })
  })
}

async function runPrebuiltFirmwareLoader(imagePath) {
  // Use the same supported Windows uploader as PlatformIO's teensy-gui path.
  // The standalone CLI has repeatedly failed block writes on this Teensy 4.0.
  const imageName = basename(imagePath, extname(imagePath))
  return new Promise((resolve, reject) => {
    const child = spawn(teensyPostCompile, [
      `-file=${imageName}`,
      `-path=${dirname(imagePath)}`,
      `-tools=${dirname(teensyPostCompile)}`,
      '-board=TEENSY40',
      '-reboot',
    ], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Prebuilt firmware upload timed out after 120 seconds'))
    }, 120000)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timeout)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error([stdout, stderr].filter(Boolean).join('\n') ||
        `Teensy loader exited ${code}`))
    })
  })
}

async function waitForTeensyApplication(timeoutMs) {
  const teensyTools = join(process.env.USERPROFILE ?? '', '.platformio', 'packages', 'tool-teensy')
  const portsTool = join(teensyTools, 'teensy_ports.exe')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const ports = await runProcess(portsTool, ['-L']).catch(() => '')
    if (/\bCOM\d+\b.*\(Teensy 4\.0\) Serial/i.test(ports)) return ports.trim()
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`MakeShift firmware USB did not return within ${timeoutMs / 1000} seconds`)
}

async function finishTeensyBoot() {
  // PlatformIO can return while its loader is still writing or rebooting.
  const port = await waitForTeensyApplication(30000)
  report('firmware-usb-ready', { port })

  // Cleanup is safe only after the application has enumerated successfully.
  await runProcess('taskkill.exe', ['/IM', 'teensy.exe', '/F']).catch(() => {})
}

async function waitForFirmwareHandshake(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (activePort && deviceCapabilities) return deviceCapabilities
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`MakeShift firmware did not complete a typed handshake within ${timeoutMs / 1000} seconds`)
}

async function verifyCheckpointFirmware(imagePath) {
  const [resolvedImage, resolvedRoot] = await Promise.all([
    realpath(imagePath), realpath(firmwareArchiveRoot),
  ])
  const rootPrefix = `${resolvedRoot}${process.platform === 'win32' ? '\\' : '/'}`
  if (!resolvedImage.startsWith(rootPrefix) || extname(resolvedImage).toLowerCase() !== '.hex') {
    throw new Error('Prebuilt firmware must be a checkpoint HEX image')
  }
  const checksumPath = join(dirname(resolvedImage), 'CHECKSUMS.sha256')
  if (!existsSync(checksumPath)) throw new Error('Checkpoint checksum manifest is missing')
  const checksums = await readFile(checksumPath, 'utf8')
  const match = checksums.split(/\r?\n/).map(line => line.trim()).find(line =>
    line.endsWith(`  ${basename(resolvedImage)}`) || line.endsWith(` *${basename(resolvedImage)}`))
  if (!match) throw new Error('Checkpoint does not declare the selected HEX image')
  const expected = match.split(/\s+/)[0].toLowerCase()
  const actual = createHash('sha256').update(await readFile(resolvedImage)).digest('hex')
  if (actual !== expected) throw new Error('Checkpoint firmware hash does not match its manifest')
  return { path: resolvedImage, sha256: actual }
}

async function flashFirmware(prebuiltPath) {
  if (firmwareUpdateInProgress) return { ok: false, reason: 'busy' }
  let imagePath = prebuiltPath ?? firmwareHex
  if (!existsSync(imagePath)) return { ok: false, reason: 'missing-firmware', path: imagePath }
  if (prebuiltPath) {
    let verified
    try { verified = await verifyCheckpointFirmware(imagePath) }
    catch (error) { return { ok: false, reason: 'invalid-checkpoint', message: String(error.message ?? error) } }
    imagePath = verified.path
    if (!existsSync(teensyLoader)) {
      return { ok: false, reason: 'missing-teensy-loader', path: teensyLoader }
    }
    if (!existsSync(teensyPostCompile)) {
      return { ok: false, reason: 'missing-teensy-post-compile', path: teensyPostCompile }
    }
  }
  firmwareUpdateInProgress = true
  yieldSerial()
  let serialResumed = false
  report('firmware-update-started', { firmwareHex: imagePath, prebuilt: Boolean(prebuiltPath) })
  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    const result = prebuiltPath
      ? await runPrebuiltFirmwareLoader(imagePath)
      : await runFirmwareLoader()
    await finishTeensyBoot()
    resumeSerial()
    serialResumed = true
    resetSerialScan('firmware-application-returned')
    const capabilities = await waitForFirmwareHandshake(30000)
    report('firmware-update-complete', {
      firmwareHex: imagePath, prebuilt: Boolean(prebuiltPath), capabilities,
    })
    return { ok: true, ...result, capabilities }
  } catch (error) {
    const message = String(error?.message ?? error)
    report('firmware-update-failed', { firmwareHex: imagePath, prebuilt: Boolean(prebuiltPath), message })
    return { ok: false, reason: 'loader-failed', message }
  } finally {
    firmwareUpdateInProgress = false
    if (!serialResumed) resumeSerial()
    setTimeout(() => resetSerialScan('post-firmware-update'), 5000).unref()
  }
}

export async function stopCore({ exitProcess = false } = {}) {
  if (shuttingDown || !coreStarted) return
  shuttingDown = true
  serialLifecycle.stop()
  detachPort()
  mediaSessionReader?.kill()
  for (const timer of coreTimers) clearInterval(timer)
  coreTimers.length = 0
  for (const watcher of coreWatchers) watcher.close()
  coreWatchers.length = 0
  coreInput?.close()
  coreInput = undefined
  clearTimeout(profileReloadTimer)
  profileReloadTimer = undefined
  if (server.listening) server.close()
  coreStarted = false
  report('stopped')
  if (exitProcess) setTimeout(() => process.exit(0), 100).unref()
}

export function getCoreStatus() {
  return Object.freeze({
    core: true,
    started: coreStarted,
    connected: Boolean(activePort),
    device: activeDeviceFingerprint,
    firmwareUpdateInProgress,
    serial: serialLifecycle.snapshot(),
    cueCount: modules.size,
    mappingCount: mappings.size,
    artworkStore: artworkAssetStore.snapshot(),
    artworkTransfers: artworkTransferScheduler.snapshot(),
    legacyArtworkResidency: legacyArtworkResidency.snapshot(),
    activeCarousel: carouselSessions.active ? {
      id: carouselSessions.active.id,
      sessionId: carouselSessions.active.wireSessionId,
    } : null,
  })
}

export function reloadCore() {
  if (!coreStarted) return false
  loadProfile()
  resetSerialScan('core-reload-while-disconnected')
  return true
}

export function yieldCore() {
  if (!coreStarted) return false
  yieldSerial()
  return true
}

export function resumeCore() {
  if (!coreStarted) return false
  resumeSerial()
  return true
}

const RPC_VERSION = 1
const MAX_RPC_BYTES = 16 * 1024

function rpcReply(id, ok, value) {
  return `${JSON.stringify(ok ? { version: RPC_VERSION, id, ok, result: value }
    : { version: RPC_VERSION, id, ok, error: String(value) })}\n`
}

async function handleRpc(request) {
  if (!request || request.version !== RPC_VERSION ||
      !['string', 'number'].includes(typeof request.id) ||
      typeof request.method !== 'string' ||
      (request.params !== undefined && (request.params === null ||
        Array.isArray(request.params) || typeof request.params !== 'object'))) {
    throw new Error('Invalid RPC request')
  }
  switch (request.method) {
    case 'core.status': return getCoreStatus()
    case 'core.reload': return { started: reloadCore() }
    case 'serial.yield': return { started: yieldCore() }
    case 'serial.resume': return { started: resumeCore() }
    case 'input.capture':
      inputCaptureUntil = Date.now() + 60000
      report('input-capture-started', { durationMs: 60000 })
      return { durationMs: 60000 }
    case 'firmware.flash': return flashFirmware()
    default: throw new Error('Unknown RPC method')
  }
}

function legacyRequest(command) {
  const methods = {
    status: 'core.status', reload: 'core.reload', yield: 'serial.yield',
    resume: 'serial.resume', 'capture-input': 'input.capture', flash: 'firmware.flash',
  }
  return methods[command] ? { version: RPC_VERSION, id: 'legacy', method: methods[command] } : null
}

const server = createServer(socket => {
  socket.setEncoding('utf8')
  let pending = ''
  socket.on('data', data => {
    pending += data
    if (Buffer.byteLength(pending, 'utf8') > MAX_RPC_BYTES) {
      socket.end(rpcReply(null, false, 'RPC message too large'))
      return
    }
    let newline
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline).trim()
      pending = pending.slice(newline + 1)
      if (!line) continue
      let request
      try { request = JSON.parse(line) } catch { request = legacyRequest(line) }
      if (!request) { socket.end('unknown\n'); return }
      void handleRpc(request).then(result => {
        if (request.id === 'legacy') socket.end(request.method === 'core.status'
          ? `${JSON.stringify(result)}\n` : 'ok\n')
        else socket.end(rpcReply(request.id, true, result))
      }).catch(error => socket.end(request.id === 'legacy' ? 'error\n'
        : rpcReply(request.id, false, error.message ?? error)))
    }
  })
})
server.on('error', error => report('core-pipe-error', { message: String(error), code: error.code }))

function listenCoreServer() {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    const onError = error => {
      server.off('listening', onListening)
      reject(error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
    try {
      server.listen(PIPE_NAME)
    } catch (error) {
      server.off('listening', onListening)
      server.off('error', onError)
      reject(error)
    }
  })
}

export async function startCore() {
  if (coreStarted) return
  shuttingDown = false
  try {
    await listenCoreServer()
  } catch (error) {
    report('core-pipe-unavailable', { message: String(error), code: error?.code })
    throw error
  }
  coreStarted = true
  startMediaSessionReader()
  void pruneRuntimeLogs()
  loadProfile()
  games = await discoverSteamGames()
  void prewarmArtworkCache().catch(error => reportRuntimeError('artwork-prewarm', error))
  void prewarmPlexContinueWatchingCache().catch(error =>
    report('plex-collection-prewarm-error', { message: String(error) }))
  serialLifecycle.start()
  report('started', { gameCount: games.length })

  const pandoraTimer = setInterval(refreshPandoraNowPlaying, 1500)
  const homeAssistantMediaTimer = setInterval(() => {
    void refreshHomeAssistantMediaPlayer().catch(error =>
      report('home-assistant-media-refresh-error', { message: String(error) }))
  }, 10000)
  const homeAssistantLightTimer = setInterval(() => {
    void refreshHomeAssistantLightAvailability(true).catch(error =>
      report('home-assistant-light-refresh-error', { message: String(error) }))
  }, 10000)
  const goXlrStatusTimer = setInterval(() => {
    if (activePort) queueGoXlr(refreshSelectedGoXlrChannel)
  }, 30000)
  const carouselRefreshTimer = setInterval(() => {
    void refreshCarouselSources().catch(error =>
      report('carousel-source-refresh-error', { message: String(error) }))
  }, 5 * 60 * 1000)
  for (const timer of [pandoraTimer, homeAssistantMediaTimer, homeAssistantLightTimer, goXlrStatusTimer, carouselRefreshTimer]) {
    timer.unref()
    coreTimers.push(timer)
  }

  for (const path of [configPath, cuesRoot, cuePluginRoot]) {
    if (!existsSync(path)) continue
    coreWatchers.push(watch(path, { recursive: path === cuesRoot }, () => {
      if (!coreStarted || shuttingDown) return
      clearTimeout(profileReloadTimer)
      profileReloadTimer = setTimeout(() => {
        profileReloadTimer = undefined
        if (coreStarted && !shuttingDown) loadProfile()
      }, 250)
    }))
  }

  coreInput = readline.createInterface({ input: process.stdin })
  coreInput.on('line', line => {
    const command = line.trim()
    if (command === 'reload') reloadCore()
    else if (command === 'shutdown') void stopCore({ exitProcess: true })
    else if (command === 'status') report('status', { connected: Boolean(activePort) })
    else if (command === 'yield') yieldCore()
    else if (command === 'resume') resumeCore()
    else if (command === 'flash') void flashFirmware()
  })
}

process.on('SIGINT', () => void stopCore({ exitProcess: true }))
process.on('SIGTERM', () => void stopCore({ exitProcess: true }))

if (process.env.MAKESHIFT_CORE_AUTOSTART !== '0') void startCore()

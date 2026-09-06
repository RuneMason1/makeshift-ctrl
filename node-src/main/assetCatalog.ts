export type RuntimeAsset = {
  id: number
  format: number
  width: number
  height: number
  data: Buffer
}

export type NamedRuntimeAsset = RuntimeAsset & { name: string }

const ASSET_PRESETS = new Map<string, string[]>([
  ['preset.common-glyphs', [
    'media.previous',
    'media.play-pause',
    'media.next',
    'media.mute',
    'media.unmute',
  ]],
  ['preset.transport-glyphs', [
    'media.previous',
    'media.play-pause',
    'media.next',
  ]],
])

const SIZE = 32
const VECTOR_SIZE = 64

function vectorArc(cx: number, cy: number, radius: number,
  startDegrees: number, endDegrees: number, width = 2): number[] {
  return [4, cx, cy, radius, Math.round(startDegrees / 2) & 0xff,
    Math.round(endDegrees / 2) & 0xff, width]
}

function speakerVectorGlyph(muted: boolean): Buffer {
  const commands = [
    // Match the filled transport glyph style instead of using an outline ring.
    1, 8, 25, 13, 14,
    2, 20, 24, 38, 12, 38, 52,
    ...vectorArc(36, 32, 10, -54, 54, 3),
    ...vectorArc(36, 32, 18, -54, 54, 3),
  ]
  if (muted) commands.push(3, 10, 10, 54, 54, 5)
  commands.push(0)
  return Buffer.from(commands)
}

function glyph(draw: (set: (x: number, y: number) => void) => void): Buffer {
  const data = Buffer.alloc((SIZE * SIZE) / 8)
  const set = (x: number, y: number) => {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
    const bit = y * SIZE + x
    data[bit >> 3] |= 0x80 >> (bit & 7)
  }
  draw(set)
  return data
}

function fillRect(set: (x: number, y: number) => void,
  left: number, top: number, right: number, bottom: number): void {
  for (let y = top; y <= bottom; ++y) {
    for (let x = left; x <= right; ++x) set(x, y)
  }
}

function fillTriangle(set: (x: number, y: number) => void,
  left: number, right: number, centerY: number): void {
  const halfHeight = 11
  for (let x = left; x <= right; ++x) {
    const progress = (x - left) / Math.max(1, right - left)
    const radius = Math.max(1, Math.round(progress * halfHeight))
    for (let y = centerY - radius; y <= centerY + radius; ++y) set(x, y)
  }
}

function thickLine(set: (x: number, y: number) => void,
  x0: number, y0: number, x1: number, y1: number, width = 3): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= steps; ++i) {
    const x = Math.round(x0 + (x1 - x0) * i / steps)
    const y = Math.round(y0 + (y1 - y0) * i / steps)
    const radius = Math.floor(width / 2)
    fillRect(set, x - radius, y - radius, x + radius, y + radius)
  }
}

function soundWave(set: (x: number, y: number) => void,
  centerX: number, centerY: number, radius: number): void {
  for (let y = -radius; y <= radius; ++y) {
    const x = Math.round(Math.sqrt(radius * radius - y * y))
    set(centerX + x, centerY + y)
    set(centerX + x + 1, centerY + y)
  }
}

const assets = new Map<string, RuntimeAsset>([
  ['media.previous', {
    id: 1, format: 1, width: SIZE, height: SIZE,
    data: glyph((set) => {
      fillRect(set, 3, 5, 6, 27)
      fillTriangle(set, 7, 17, 16)
      fillTriangle(set, 17, 27, 16)
    }),
  }],
  ['media.play-pause', {
    id: 2, format: 1, width: SIZE, height: SIZE,
    data: glyph((set) => {
      fillTriangle(set, 3, 14, 16)
      fillRect(set, 19, 5, 22, 27)
      fillRect(set, 26, 5, 29, 27)
    }),
  }],
  ['media.next', {
    id: 3, format: 1, width: SIZE, height: SIZE,
    data: glyph((set) => {
      for (let x = 4; x <= 14; ++x) {
        const radius = Math.max(1, Math.round((14 - x) / 10 * 11))
        for (let y = 16 - radius; y <= 16 + radius; ++y) set(x, y)
      }
      for (let x = 14; x <= 24; ++x) {
        const radius = Math.max(1, Math.round((24 - x) / 10 * 11))
        for (let y = 16 - radius; y <= 16 + radius; ++y) set(x, y)
      }
      fillRect(set, 25, 5, 28, 27)
    }),
  }],
  ['media.mute', {
    id: 4, format: 2, width: VECTOR_SIZE, height: VECTOR_SIZE,
    data: speakerVectorGlyph(true),
  }],
  ['media.unmute', {
    id: 5, format: 2, width: VECTOR_SIZE, height: VECTOR_SIZE,
    data: speakerVectorGlyph(false),
  }],
])

export function resolveRuntimeAssets(names: Iterable<string>,
  cueAssets: Iterable<NamedRuntimeAsset> = []): RuntimeAsset[] {
  const resolved = new Map<number, RuntimeAsset>()
  for (const name of names) {
    const preset = ASSET_PRESETS.get(name)
    if (preset) {
      for (const presetName of preset) {
        const asset = assets.get(presetName)
        if (asset) resolved.set(asset.id, asset)
      }
      continue
    }
    const asset = assets.get(name)
    if (asset) resolved.set(asset.id, asset)
  }
  // Cue-bundled assets are authoritative over optional shared presets.
  for (const asset of cueAssets) resolved.set(asset.id, asset)
  return [...resolved.values()]
}

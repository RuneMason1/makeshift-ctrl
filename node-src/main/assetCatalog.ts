export type RuntimeAsset = {
  id: number
  format: number
  width: number
  height: number
  data: Buffer
}

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
    id: 4, format: 1, width: SIZE, height: SIZE,
    data: glyph((set) => {
      fillRect(set, 4, 10, 9, 22)
      fillTriangle(set, 10, 18, 16)
      for (let y = 11; y <= 21; ++y) set(22, y)
      for (let y = 8; y <= 24; ++y) set(27, y)
      for (let i = 0; i <= 22; ++i) set(4 + i, 26 - i)
    }),
  }],
  ['media.unmute', {
    id: 5, format: 1, width: SIZE, height: SIZE,
    data: glyph((set) => {
      fillRect(set, 4, 10, 9, 22)
      fillTriangle(set, 10, 18, 16)
      for (let y = 11; y <= 21; ++y) set(22, y)
      for (let y = 8; y <= 24; ++y) set(27, y)
    }),
  }],
])

export function resolveRuntimeAssets(names: Iterable<string>): RuntimeAsset[] {
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
  return [...resolved.values()]
}

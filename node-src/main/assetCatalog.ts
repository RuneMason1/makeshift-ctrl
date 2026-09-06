import materialGlyphCatalog from './materialGlyphCatalog.json'

export type RuntimeAsset = {
  id: number
  format: number
  width: number
  height: number
  data: Buffer
}

export type NamedRuntimeAsset = RuntimeAsset & { name: string }

type MaterialGlyph = Omit<NamedRuntimeAsset, 'data'> & { data: string }

const ASSET_PRESETS = new Map<string, string[]>([
  ['preset.common-glyphs', [
    'media.previous', 'media.play-pause', 'media.next',
    'media.mute', 'media.unmute',
  ]],
  ['preset.transport-glyphs', [
    'media.previous', 'media.play-pause', 'media.next',
  ]],
])

// Generated from the Material Symbols catalog. Keep the on-device protocol
// generic: these compact 1bpp assets are cue-addressable, not firmware art.
const assets = new Map<string, RuntimeAsset>(
  (materialGlyphCatalog.assets as MaterialGlyph[]).map((asset) => [asset.name, {
    ...asset,
    data: Buffer.from(asset.data, 'base64'),
  }]),
)

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
  // A cue can still supply a private custom asset when a catalog icon is not
  // appropriate; it intentionally wins over the common catalog entry.
  for (const asset of cueAssets) resolved.set(asset.id, asset)
  return [...resolved.values()]
}

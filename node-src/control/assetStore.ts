import { createHash } from 'node:crypto'

export type ArtworkFormat = 'rgb565-be'

export type AssetVariant = Readonly<{
  assetKey: string
  contentHash: string
  format: ArtworkFormat
  width: number
  height: number
  bytes: Buffer
  qualityTier: 'navigation' | 'presentation'
}>

type StoredAsset = AssetVariant & { leases: number; lastUsedAt: number }

export type AssetLease = Readonly<{
  asset: AssetVariant
  release: () => void
}>

/** Shared immutable host-RAM source cache for provider-prepared artwork. */
export class AssetStore {
  private readonly assets = new Map<string, StoredAsset>()
  private usedBytes = 0

  constructor(private readonly byteLimit = 128 * 1024 * 1024) {}

  put(asset: Omit<AssetVariant, 'contentHash'> & { contentHash?: string }): AssetVariant {
    if (!asset.assetKey || asset.width < 1 || asset.height < 1 ||
        asset.bytes.length !== asset.width * asset.height * 2) {
      throw new Error('Invalid RGB565 asset variant')
    }
    const contentHash = asset.contentHash ?? createHash('sha256').update(asset.bytes).digest('hex')
    const previous = this.assets.get(asset.assetKey)
    if (previous) this.usedBytes -= previous.bytes.length
    const stored: StoredAsset = {
      ...asset,
      contentHash,
      bytes: Buffer.from(asset.bytes),
      leases: 0,
      lastUsedAt: Date.now(),
    }
    this.assets.set(stored.assetKey, stored)
    this.usedBytes += stored.bytes.length
    this.evict()
    return this.publicAsset(stored)
  }

  lease(assetKey: string): AssetLease | undefined {
    const stored = this.assets.get(assetKey)
    if (!stored) return undefined
    stored.leases++
    stored.lastUsedAt = Date.now()
    let released = false
    return Object.freeze({
      asset: this.publicAsset(stored),
      release: () => {
        if (released) return
        released = true
        stored.leases--
        stored.lastUsedAt = Date.now()
        this.evict()
      },
    })
  }

  snapshot(): Readonly<{ entryCount: number; usedBytes: number; byteLimit: number }> {
    return Object.freeze({ entryCount: this.assets.size, usedBytes: this.usedBytes, byteLimit: this.byteLimit })
  }

  private publicAsset(stored: StoredAsset): AssetVariant {
    return Object.freeze({
      assetKey: stored.assetKey,
      contentHash: stored.contentHash,
      format: stored.format,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      qualityTier: stored.qualityTier,
    })
  }

  private evict(): void {
    while (this.usedBytes > this.byteLimit) {
      const candidate = [...this.assets.values()]
        .filter(asset => asset.leases === 0)
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0]
      if (!candidate) return
      this.assets.delete(candidate.assetKey)
      this.usedBytes -= candidate.bytes.length
    }
  }
}

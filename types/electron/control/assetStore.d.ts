export type ArtworkFormat = 'rgb565-be';
export type AssetVariant = Readonly<{
    assetKey: string;
    contentHash: string;
    format: ArtworkFormat;
    width: number;
    height: number;
    bytes: Buffer;
    qualityTier: 'navigation' | 'presentation';
}>;
export type AssetLease = Readonly<{
    asset: AssetVariant;
    release: () => void;
}>;
/** Shared immutable host-RAM source cache for provider-prepared artwork. */
export declare class AssetStore {
    private readonly byteLimit;
    private readonly assets;
    private usedBytes;
    constructor(byteLimit?: number);
    put(asset: Omit<AssetVariant, 'contentHash'> & {
        contentHash?: string;
    }): AssetVariant;
    lease(assetKey: string): AssetLease | undefined;
    snapshot(): Readonly<{
        entryCount: number;
        usedBytes: number;
        byteLimit: number;
    }>;
    private publicAsset;
    private evict;
}

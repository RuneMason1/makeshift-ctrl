export type RuntimeAsset = {
    id: number;
    format: number;
    width: number;
    height: number;
    data: Buffer;
};
export declare function resolveRuntimeAssets(names: Iterable<string>): RuntimeAsset[];

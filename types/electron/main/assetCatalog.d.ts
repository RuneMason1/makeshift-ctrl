export type RuntimeAsset = {
    id: number;
    format: number;
    width: number;
    height: number;
    data: Buffer;
};
export type NamedRuntimeAsset = RuntimeAsset & {
    name: string;
};
export declare function resolveRuntimeAssets(names: Iterable<string>, cueAssets?: Iterable<NamedRuntimeAsset>): RuntimeAsset[];

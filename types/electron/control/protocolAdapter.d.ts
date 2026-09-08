/** Firmware-selected artwork protocol. Never send a host-only packet format. */
export type ArtworkProtocol = 'legacy-direct-art' | 'keyed-cache' | 'unknown';
export type FirmwareCapabilities = Readonly<{
    messageTypeCeiling: number;
    directArtSlots?: number;
    keyedCacheBytes?: number;
}>;
export declare function selectArtworkProtocol(capabilities: FirmwareCapabilities): ArtworkProtocol;
export type DirectArtJob = Readonly<{
    sessionId: number;
    itemIndex: number;
    slot: number;
    artwork: Buffer;
}>;
export declare function validateDirectArtJob(job: DirectArtJob, slots: number): boolean;

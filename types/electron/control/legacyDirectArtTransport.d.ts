import type { CarouselItem, CarouselTransport } from './carouselCoordinator';
export type PacketWriter = Readonly<{
    sendPacket: (messageType: number, body?: Buffer) => boolean;
}>;
export type DirectArtwork = Readonly<{
    slot: number;
    itemIndex: number;
    title: string;
    rgb565: Buffer;
}>;
/**
 * Exact adapter for firmware through MessageType 26. This intentionally does
 * not send cache/session packets 27-32, which that firmware cannot receive.
 */
export declare class LegacyDirectArtTransport implements CarouselTransport {
    private readonly writer;
    private readonly chunkPixels;
    private readonly interChunkDelayMs;
    constructor(writer: PacketWriter, chunkPixels?: number, interChunkDelayMs?: number);
    commitList(items: readonly CarouselItem[]): Promise<boolean>;
    bindInput(dial: number, button: number): Promise<boolean>;
    sendArtwork(artwork: DirectArtwork): Promise<boolean>;
    private boundedTitle;
    private delay;
}

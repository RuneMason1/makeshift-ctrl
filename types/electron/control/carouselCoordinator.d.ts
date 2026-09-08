export type CarouselItem = Readonly<{
    itemId: string;
    title: string;
}>;
export type CarouselSession = Readonly<{
    id: string;
    connectionId: number;
    sessionId: number;
    input: Readonly<{
        dial: number;
        button: number;
    }>;
    items: readonly CarouselItem[];
}>;
export type CarouselTransport = Readonly<{
    commitList: (items: readonly CarouselItem[]) => Promise<boolean>;
    bindInput: (dial: number, button: number) => Promise<boolean>;
}>;
export type CarouselCallbacks = Readonly<{
    requestArtwork: (session: CarouselSession, item: CarouselItem) => void;
    activate: (session: CarouselSession, item: CarouselItem) => void;
}>;
/**
 * Firmware emits legacy GAME_* notifications without provider identity. This
 * coordinator supplies it from the immutable active Ctrl session.
 */
export declare class CarouselCoordinator {
    private readonly transport;
    private readonly callbacks;
    private active;
    constructor(transport: CarouselTransport, callbacks: CarouselCallbacks);
    snapshot(): CarouselSession | undefined;
    open(session: CarouselSession): Promise<boolean>;
    selectLegacyItem(itemId: string): boolean;
    activateLegacyItem(itemId: string): boolean;
    preloadFirst(): boolean;
    private requestSelected;
    private validate;
}

import { MakeShiftPort } from '@eos-makeshift/serial';
export declare class GameLauncher {
    private readonly getPort;
    private games;
    private selectedIndex;
    private visible;
    private transferId;
    private hideTimer?;
    private artworkCache;
    constructor(getPort: () => MakeShiftPort | undefined);
    initialize(): Promise<void>;
    handleEvent(eventName: string): Promise<boolean>;
    private showSelectedGame;
    private cachedArtwork;
    private prewarmArtworkCache;
    private resetHideTimer;
    private returnHome;
}

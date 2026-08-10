import { MakeShiftPort } from '@eos-makeshift/serial';
export declare class GameLauncher {
    private readonly getPort;
    private games;
    private selectedIndex;
    private visible;
    private transferId;
    private hideTimer?;
    private artworkTimer?;
    private artworkCache;
    private showArtwork;
    constructor(getPort: () => MakeShiftPort | undefined);
    initialize(): Promise<void>;
    setArtworkEnabled(enabled: boolean): void;
    syncToDevice(port?: any): void;
    handleDeviceMessage(message: string): Promise<void>;
    handleEvent(eventName: string, showArtwork?: boolean): Promise<boolean>;
    private showSelectedGame;
    private sendArtwork;
    private cachedArtwork;
    private prewarmArtworkCache;
    private resetHideTimer;
    private returnHome;
}

import { MakeShiftPort } from '@eos-makeshift/serial';
export type { CollectionItem } from './collectionRuntime';
export declare class GameLauncher {
    readonly id = "steam";
    private games;
    private readonly runtime;
    constructor(getPort: () => MakeShiftPort | undefined);
    initialize(): Promise<void>;
    setArtworkEnabled(enabled: boolean): void;
    syncToDevice(port?: MakeShiftPort): void;
    handleDeviceMessage(message: string): Promise<void>;
    handleEvent(eventName: string, showArtwork?: boolean): Promise<boolean>;
    private ensureInitialized;
}
export { GameLauncher as SteamCollectionProvider };

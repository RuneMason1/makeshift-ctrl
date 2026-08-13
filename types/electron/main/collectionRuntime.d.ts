import { MakeShiftPort } from '@eos-makeshift/serial';
export type CollectionItem = {
    itemId: string;
    title: string;
    rank: number;
    artworkPath: string;
};
export type CollectionRuntimeOptions = {
    getPort: () => MakeShiftPort | undefined;
    activateItem: (item: CollectionItem) => Promise<void>;
    messagePrefix?: string;
    dialEventPrefix?: string;
    localItemLimit?: number;
};
export declare class CollectionRuntime {
    private readonly options;
    private items;
    private selectedIndex;
    private visible;
    private transferId;
    private hideTimer?;
    private artworkTimer?;
    private artworkCache;
    private showArtwork;
    private readonly messagePrefix;
    private readonly dialEventPrefix;
    private readonly localItemLimit;
    constructor(options: CollectionRuntimeOptions);
    setItems(items: CollectionItem[]): void;
    setArtworkEnabled(enabled: boolean): void;
    syncToDevice(port?: any): void;
    handleDeviceMessage(message: string): Promise<void>;
    handleEvent(eventName: string, showArtwork?: boolean): Promise<boolean>;
    private showSelectedItem;
    private sendArtwork;
    private cachedArtwork;
    private resetHideTimer;
    private returnHome;
}

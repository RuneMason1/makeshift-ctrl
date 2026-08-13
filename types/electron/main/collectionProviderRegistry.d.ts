import { MakeShiftPort } from '@eos-makeshift/serial';
export interface CollectionProvider {
    readonly id: string;
    initialize(): Promise<void>;
    setArtworkEnabled(enabled: boolean): void;
    syncToDevice(port?: MakeShiftPort): void;
    handleDeviceMessage(message: string): Promise<void>;
    handleEvent(eventName: string, showArtwork?: boolean): Promise<boolean>;
}
export type CollectionProviderFactory = () => CollectionProvider;
export declare class CollectionProviderRegistry {
    private readonly factories;
    private readonly providers;
    register(id: string, factory: CollectionProviderFactory): void;
    has(id: string): boolean;
    get(id: string): CollectionProvider;
    initialize(): Promise<void>;
    handleDeviceMessage(message: string): Promise<void>;
    syncToDevice(port: MakeShiftPort): void;
}

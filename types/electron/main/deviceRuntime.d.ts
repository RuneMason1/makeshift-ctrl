import { MakeShiftPort } from '@eos-makeshift/serial';
export declare const RUNTIME_PROTOCOL_VERSION = 1;
export declare enum RuntimeComponentType {
    Carousel = 1,
    MeterBank = 2,
    TransportBar = 3,
    LogoPanel = 4,
    ButtonGrid = 5,
    ListPicker = 6,
    StatusCard = 7
}
export declare const RuntimeComponentAlias: {
    readonly CollectionView: RuntimeComponentType.Carousel;
    readonly OverlayGlyphPanel: RuntimeComponentType.TransportBar;
    readonly InfoPanel: RuntimeComponentType.StatusCard;
};
export declare enum RuntimeZone {
    Special = 0,
    LowerLeft = 1,
    LowerRight = 2,
    Upper = 3,
    Center = 4
}
export declare const RuntimeZoneAlias: {
    readonly FullScreen: RuntimeZone.Special;
    readonly Left: RuntimeZone.LowerLeft;
    readonly TopBar: RuntimeZone.Upper;
    readonly Overlay: RuntimeZone.Center;
    readonly CenterStage: RuntimeZone.Special;
    readonly SidebarLeft: RuntimeZone.LowerLeft;
    readonly CornerLowerRight: RuntimeZone.LowerRight;
    readonly BannerTop: RuntimeZone.Upper;
    readonly FloatingOverlay: RuntimeZone.Center;
};
export declare enum RuntimeComponentFlag {
    Enabled = 1,
    Preload = 2
}
export type RuntimeComponent = {
    id: number;
    type: RuntimeComponentType;
    zone: RuntimeZone;
    flags: number;
};
export declare class DeviceRuntimeManifest {
    private components;
    private assets;
    register(component: RuntimeComponent): void;
    unregister(id: number): void;
    setRequiredAssets(names: Iterable<string>): void;
    setRequiredComponents(names: Iterable<string>): void;
    sync(port: MakeShiftPort): boolean;
    private syncAssets;
}

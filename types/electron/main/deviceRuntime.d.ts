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
    FullScreen = 0,
    Left = 1,
    LowerRight = 2,
    TopBar = 3,
    Overlay = 4
}
export declare const RuntimeZoneAlias: {
    readonly CenterStage: RuntimeZone.FullScreen;
    readonly SidebarLeft: RuntimeZone.Left;
    readonly CornerLowerRight: RuntimeZone.LowerRight;
    readonly BannerTop: RuntimeZone.TopBar;
    readonly FloatingOverlay: RuntimeZone.Overlay;
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

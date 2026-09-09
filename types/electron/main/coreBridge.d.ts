export type CoreBridgeStatus = Readonly<{
    attached: boolean;
    core: boolean;
    connected: boolean;
    firmwareUpdateInProgress: boolean;
    serial: Readonly<{
        started: boolean;
        yielded: boolean;
        recoveryPending: boolean;
    }>;
    cueCount: number;
    mappingCount: number;
    activeCarousel?: Readonly<{
        id: string;
        sessionId: number;
    }> | null;
    reason?: string;
}>;
/** Firmware update authority lives exclusively in Core. */
export declare function flashCoreFirmware(): Promise<{
    ok: boolean;
    reason?: string;
    message?: string;
}>;
/** Ctrl's tray controls ask the existing Core owner to release or reclaim serial. */
export declare function yieldCoreSerial(): Promise<{
    started: boolean;
}>;
export declare function resumeCoreSerial(): Promise<{
    started: boolean;
}>;
/** Read-only bridge to the active Core host. Ctrl never opens the serial port. */
export declare function readCoreStatus(timeoutMs?: number): Promise<CoreBridgeStatus>;

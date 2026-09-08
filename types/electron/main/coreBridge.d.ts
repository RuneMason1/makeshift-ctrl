export type CoreBridgeStatus = Readonly<{
    attached: boolean;
    core: boolean;
    connected: boolean;
    firmwareUpdateInProgress: boolean;
    cueCount: number;
    mappingCount: number;
    activeCarousel?: Readonly<{
        id: string;
        sessionId: number;
    }> | null;
    reason?: string;
}>;
/** Read-only bridge to the active Core host. Ctrl never opens the serial port. */
export declare function readCoreStatus(timeoutMs?: number): Promise<CoreBridgeStatus>;

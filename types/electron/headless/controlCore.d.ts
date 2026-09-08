/**
 * Headless MakeShift control boundary.
 *
 * This is intentionally transport-neutral: the current Systray agent remains
 * authoritative until it is migrated to this core and parity-tested. Frontends
 * must use this API rather than opening a second serial owner.
 */
export type ControlCoreMode = 'tray' | 'desktop';
export type ControlCoreStatus = Readonly<{
    ownerId: string;
    mode: ControlCoreMode;
    connected: boolean;
    protocol: 'legacy-direct-art' | 'keyed-cache' | 'unknown';
}>;
export type ControlCoreClient = Readonly<{
    clientId: string;
    mode: ControlCoreMode;
}>;
export declare class ControlCore {
    private readonly clients;
    private status;
    constructor(ownerId: string, mode: ControlCoreMode);
    attach(client: ControlCoreClient): ControlCoreStatus;
    detach(clientId: string): void;
    snapshot(): ControlCoreStatus;
    publish(status: Partial<Omit<ControlCoreStatus, 'ownerId' | 'mode'>>): void;
}

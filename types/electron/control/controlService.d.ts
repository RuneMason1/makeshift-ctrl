/**
 * Core is the one headless MakeShift engine. Ctrl and the private agent are
 * clients/hosts around it; only Core's singleton owner may open the device.
 */
export type ControlMode = 'window-visible' | 'window-hidden';
export type ControlServiceStatus = Readonly<{
    ownerId: string;
    mode: ControlMode;
    connected: boolean;
    protocol: 'legacy-direct-art' | 'keyed-cache' | 'unknown';
}>;
export type ControlClient = Readonly<{
    clientId: string;
    mode: ControlMode;
}>;
export declare class Core {
    private readonly clients;
    private status;
    constructor(ownerId: string, mode: ControlMode);
    attach(client: ControlClient): ControlServiceStatus;
    detach(clientId: string): void;
    snapshot(): ControlServiceStatus;
    publish(status: Partial<Omit<ControlServiceStatus, 'ownerId' | 'mode'>>): void;
}
export { Core as ControlService };

export type TransferPriority = 0 | 1 | 2;
export type TransferIdentity = Readonly<{
    connectionId: number;
    sessionId: number;
    assetKey: string;
    reason: 'selected' | 'neighbor' | 'preload';
}>;
export type TransferJob = Readonly<{
    identity: TransferIdentity;
    priority: TransferPriority;
    isCurrent: () => boolean;
    run: () => Promise<void>;
}>;
/** One ordered lane for all providers. Stale jobs send zero bytes. */
export declare class TransferScheduler {
    private readonly queued;
    private running;
    enqueue(job: TransferJob): void;
    cancelStale(): void;
    private drain;
}

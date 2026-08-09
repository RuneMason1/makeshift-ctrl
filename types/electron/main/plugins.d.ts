import { Worker } from 'node:worker_threads';
import { RequestMessage, WorkerAPI } from '../pluginTypes';
export type Plugin = {
    name: string;
    path: string;
    manifest: any;
    id: string;
    worker: PluginWorker;
};
export declare const plugins: Map<string, Plugin>;
export declare function initPlugins(): Promise<void>;
export declare function killPluginHost(): void;
export declare function installPlugin(): Promise<void>;
declare class PluginWorker extends Worker {
    private pluginRequestHeap;
    private msgen;
    constructor(filename: string, options?: any);
    postMessage<T extends string | WorkerAPI>(message: RequestMessage<T>, transferList?: any[]): void;
}
export {};

export declare const call: {
    stat: (path: string) => void;
    load: (pluginRoot: string) => Promise<void>;
    echo: (msg: string) => void;
    stop: () => never;
};
export type WorkerAPI = keyof typeof call;

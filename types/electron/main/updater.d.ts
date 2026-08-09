import { LogLevel } from "@eos-makeshift/msg";
export declare const knownReleaseList: any[];
export declare let updateAvailable: boolean;
export declare function checkForUpdates(opts: {
    logLvl?: LogLevel;
}): Promise<any>;

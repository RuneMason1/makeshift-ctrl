export declare const ctrlIpcApi: {
    test: string;
    call: {
        openCueFolder: string;
        runCue: string;
        pauseCtrlSerial: string;
        resumeCtrlSerial: string;
        uploadFirmware: string;
        fetchBlocklyToolbox: string;
        fetchBlocklyBlocks: string;
        fetchBlocklyDefaultWorkspace: string;
    };
    get: {
        deviceEvents: string;
        serialEvents: string;
        hardwareDescriptors: string;
        eventsAsList: string;
        connectedDevices: string;
        logRank: string;
        clientSize: string;
        allCues: string;
        allBlocklySerialWorkspaceNames: string;
        blocklyToolbox: string;
        blocklySerialWorkspace: string;
        blockGenerator: string;
        cuesAttachedToEvent: string;
        cueById: string;
        cueByFolder: string;
        currentView: string;
        defaultTheme: string;
        themeFromPath: string;
    };
    set: {
        cueFile: string;
        cueForEvent: string;
        currentView: string;
        serialWorkspaceAsCue: string;
    };
    delete: {
        workspace: string;
    };
    onEv: {
        app: {
            updateAvailable: string;
        };
        blockly: {
            toolboxUpdate: string;
            blocksUpdate: string;
            workspaceUpdate: string;
            workspaceListUpdate: string;
        };
        cue: {
            added: string;
            changed: string;
            removed: string;
        };
        device: {
            connected: string;
            disconnected: string;
        };
        terminal: {
            data: string;
        };
    };
};
export declare const storeKeys: {
    LogLevel: string;
    UuidNamespace: string;
    MainWindowState: string;
    DeviceLayout: string;
    CurrentView: string;
};
export type CtrlIpcApi = typeof ctrlIpcApi;
export type StoreKeys = typeof storeKeys;

import { Cue } from 'types/electron/main/cues';
export type SensorEventDetails = {
    sensorId: number;
    sensorType: string;
    eventType: string;
};
export type CoreStatus = {
    attached: boolean;
    core: boolean;
    connected: boolean;
    firmwareUpdateInProgress: boolean;
    serial: {
        started: boolean;
        yielded: boolean;
        recoveryPending: boolean;
    };
    cueCount: number;
    mappingCount: number;
    activeCarousel?: {
        id: string;
        sessionId: number;
    } | null;
    reason?: string;
};
export type Folder = {
    name: string;
    subFolders: Folder[];
    files: Cue[];
};

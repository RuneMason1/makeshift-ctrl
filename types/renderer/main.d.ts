import { Cue } from 'types/electron/main/cues';
export type SensorEventDetails = {
    sensorId: number;
    sensorType: string;
    eventType: string;
};
export type Folder = {
    name: string;
    subFolders: Folder[];
    files: Cue[];
};

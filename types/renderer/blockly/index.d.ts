import '@blockly/field-grid-dropdown';
import { MakeShiftBlockJSON } from 'electron/main/blockly';
export type BlockGroup = {
    name: string;
    id: string;
    blockTuples: {
        block: any;
        init: Function;
    }[];
    toolboxCategory: any;
    flyoutCallback?: Function;
};
export declare const toast = "toast";
export declare const storage = "toast";
export declare const blockmap: {
    [key: string]: MakeShiftBlockJSON;
};
export declare function importBlocklist(newblocks: MakeShiftBlockJSON[]): void;

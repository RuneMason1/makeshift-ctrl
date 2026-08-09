export interface PopupOptions {
    message: string;
    onOkay?: () => void;
}
export interface ConfirmPopupOptions {
    message: string;
    onOkay: (val: boolean) => void;
    onCancel: (val: boolean) => void;
}
export interface PromptPopupOptions {
    message: string;
    inputLabels: string[];
    onOkay: (val: string[]) => void;
    onCancel: (val: string[]) => void;
}
export declare class SimplePopup {
    readonly id: string;
    readonly hasInput: boolean;
    readonly hasCancel: boolean;
    readonly inputLabels: string[];
    readonly inputValues: string[];
    message: string;
    private simpleOkay;
    constructor(opts: PopupOptions);
    okay(): void;
    cancel(): void;
}
export declare class ConfirmPopup extends SimplePopup {
    readonly hasInput: boolean;
    readonly hasCancel: boolean;
    readonly inputLabels: string[];
    readonly inputValues: string[];
    private confirmOkay;
    private confirmCancel;
    constructor(opts: ConfirmPopupOptions);
    okay(): void;
    cancel(): void;
}
export declare class PromptPopup extends SimplePopup {
    readonly hasInput: boolean;
    readonly hasCancel: boolean;
    readonly inputLabels: string[];
    inputValues: string[];
    private promptOkay;
    private promptCancel;
    constructor(opts: PromptPopupOptions);
    okay(): void;
    cancel(): void;
}
export declare function usePopup(): {
    showPrompt: (opts: {
        message: string;
        inputLabels?: boolean | string | string[];
        onOkay?: (val: string[]) => void;
        onCancel?: (val: string[]) => void;
    }) => void;
    showConfirm: (opts: {
        message: string;
        onOkay?: (val: boolean) => void;
        onCancel?: (val: boolean) => void;
    }) => void;
    showSimplePopup: (opts: {
        message: string;
        onOkay?: () => void;
    }) => void;
};

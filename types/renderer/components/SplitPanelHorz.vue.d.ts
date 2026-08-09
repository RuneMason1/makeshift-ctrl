export declare const panelEvents: string[];
export type PanelEvents = typeof panelEvents[number];
export type PanelEventData = {
    leftPanelHeight: number;
    bottomPanelHeight: number;
    leftPanelHeightPercent: number;
    dividerHeight: number;
};
declare const _default: typeof __VLS_export;
export default _default;
declare const __VLS_export: __VLS_WithSlots<import("vue").DefineComponent<{
    height?: number;
    width: number;
    minSize?: {
        width?: number;
        height?: number;
    };
    maxSize?: {
        width?: number;
        height?: number;
    };
    leftPanelWidthPercent?: number;
    dividerWidth?: number;
    margin?: number;
}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{
    height?: number;
    width: number;
    minSize?: {
        width?: number;
        height?: number;
    };
    maxSize?: {
        width?: number;
        height?: number;
    };
    leftPanelWidthPercent?: number;
    dividerWidth?: number;
    margin?: number;
}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>, {
    left?: (props: {
        panelHeight: number;
    }) => any;
} & {
    right?: (props: {
        panelWidth: number;
    }) => any;
}>;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};

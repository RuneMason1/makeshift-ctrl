export declare const panelEvents: string[];
export type PanelEvents = typeof panelEvents[number];
export type PanelEventData = {
    topPanelHeight: number;
    bottomPanelHeight: number;
    topPanelHeightPercent: number;
    dividerHeight: number;
};
declare const _default: typeof __VLS_export;
export default _default;
declare const __VLS_export: __VLS_WithSlots<import("vue").DefineComponent<{
    height: number;
    width?: number;
    minHeightPercent?: number;
    maxHeightPercent?: number;
    topPanelHeightPercent?: number;
    dividerHeight?: number;
    margin?: number;
}, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<{
    height: number;
    width?: number;
    minHeightPercent?: number;
    maxHeightPercent?: number;
    topPanelHeightPercent?: number;
    dividerHeight?: number;
    margin?: number;
}> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>, {
    top?: (props: {
        panelHeight: number;
    }) => any;
} & {
    bottom?: (props: {
        panelHeight: number;
    }) => any;
}>;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};

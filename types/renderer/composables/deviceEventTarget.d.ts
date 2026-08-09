export declare function useBooleanState(): {
    state: import("vue").Ref<{
        eventString: string;
        sensorId: number;
        eventType: "BUTTON" | "DIAL";
    }, {
        eventString: string;
        sensorId: number;
        eventType: "BUTTON" | "DIAL";
    } | {
        eventString: string;
        sensorId: number;
        eventType: "BUTTON" | "DIAL";
    }>;
    toggle: () => void;
};

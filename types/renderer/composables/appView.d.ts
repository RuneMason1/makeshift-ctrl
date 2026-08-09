import { View } from "../renderer";
export declare function useView(): {
    selectedView: import("vue").Ref<View, View>;
    ViewList: View[];
    setView: (view: View) => void;
};

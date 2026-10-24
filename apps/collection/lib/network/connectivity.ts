import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { create } from "zustand";

export type Connectivity = "unknown" | "online" | "offline";
export function connectionStatus(
  state: Pick<NetInfoState, "isConnected" | "isInternetReachable">,
): Connectivity {
  if (state.isConnected === false || state.isInternetReachable === false)
    return "offline";
  return state.isConnected === true && state.isInternetReachable === true
    ? "online"
    : "unknown";
}
export const useConnectivityStore = create<{ status: Connectivity }>(() => ({
  status: "unknown",
}));
export function monitorConnectivity(onReconnect: () => void) {
  return NetInfo.addEventListener((state) => {
    const previous = useConnectivityStore.getState().status;
    const status = connectionStatus(state);
    useConnectivityStore.setState({ status });
    if (status === "online" && previous !== "online") onReconnect();
  });
}
export const refreshConnectivity = () => NetInfo.refresh();

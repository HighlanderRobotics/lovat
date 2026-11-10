import type { NavigationAction, NavigationState } from "expo-router";

type ResetNavigation = {
  getState: () => NavigationState | undefined;
  dispatch: (action: NavigationAction) => void;
};

// The index screen is replaced by its redirect, so dismissTo("/") cannot
// find it. SDK 58 requires a complete state for RESET, including route keys.
export function resetToStart(navigation: ResetNavigation) {
  const state = navigation.getState();
  if (!state) return;
  navigation.dispatch({
    type: "RESET",
    payload: {
      ...state,
      index: 0,
      routes: [
        { name: "index", key: `${state.key}-index-${state.routeKeySeq}` },
      ],
      routeKeySeq: state.routeKeySeq + 1,
    },
  });
}

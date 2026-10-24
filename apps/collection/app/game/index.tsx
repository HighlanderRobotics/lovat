import { Suspense, useCallback } from "react";
import { Game } from "../../lib/collection/ui/Game";
import { ActivityIndicator, Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useIsFocused } from "@react-navigation/native";
import { useKeepAwake } from "expo-keep-awake";
import { useReportStateStore } from "../../lib/collection/reportStateStore";

export default function GamePage() {
  const focused = useIsFocused();
  const scouting = useReportStateStore(
    (state) => !!state.meta && !!state.startTimestamp,
  );
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (Platform.OS === "android") {
          await NavigationBar.setVisibilityAsync("hidden");
        }
      })();

      return () => {
        (async () => {
          if (Platform.OS === "android") {
            await NavigationBar.setVisibilityAsync("visible");
          }
        })();
      };
    }, []),
  );

  return (
    <>
      {focused && scouting && <ScoutingKeepAwake />}
      {/* Expo manages the iOS status bar globally rather than per controller. */}
      <StatusBar hidden animated={false} />
      <Stack.Screen
        options={{
          orientation: "landscape",
          statusBarHidden: true,
          statusBarAnimation: "none",
          animationDuration: 0,
          animationTypeForReplace: "push",
          animation: "flip",
        }}
      />
      <Suspense fallback={<ActivityIndicator />}>
        <Game />
      </Suspense>
    </>
  );
}

function ScoutingKeepAwake() {
  useKeepAwake("collection-active-match", { suppressDeactivateWarnings: true });
  return null;
}

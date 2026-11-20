import React from "react";
import { Platform, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { liveActivities } from "../modules/lovat-live-activities";
import { NavBar } from "../lib/components/NavBar";
import { IconButton } from "../lib/components/IconButton";
import Button from "../lib/components/Button";
import BodyMedium from "../lib/components/text/BodyMedium";
import TitleMedium from "../lib/components/text/TitleMedium";
import { colors } from "../lib/colors";
import {
  stopLiveActivities,
  useLiveActivityDebug,
  useLiveActivitySettings,
} from "../lib/liveActivities/LiveActivityConnection";

export default function Debug() {
  const enabled = useLiveActivitySettings((state) => state.enabled);
  const debug = useLiveActivityDebug();
  const preview = (mode: "live" | "waiting" | "onShift") => {
    useLiveActivitySettings.setState({ enabled: true });
    useLiveActivityDebug.setState({ mode, revision: debug.revision + 1 });
  };

  return (
    <>
      <NavBar
        title="Debug"
        left={
          <IconButton
            icon="arrow_back_ios"
            label="Back"
            color={colors.onBackground.default}
            onPress={() => router.back()}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <SafeAreaView edges={["bottom"]} style={{ gap: 16 }}>
          <TitleMedium>Live Activities</TitleMedium>
          <BodyMedium>
            Show your next assigned match and the team you need to scout on the
            Lock Screen and Dynamic Island. Q = qualifier, P = playoff, F =
            final.
          </BodyMedium>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <BodyMedium>Enable Live Activities</BodyMedium>
            <Switch
              accessibilityLabel="Enable Live Activities"
              value={enabled}
              onValueChange={(value) => {
                useLiveActivitySettings.setState({ enabled: value });
                useLiveActivityDebug.setState({ mode: "live" });
              }}
            />
          </View>
          {!liveActivities && (
            <BodyMedium>
              {Platform.OS === "ios"
                ? "Install a native Collection build with Live Activity support. Expo Go does not include this feature."
                : "Live Activities are available on iPhone. Android scouting continues to work normally."}
            </BodyMedium>
          )}
          {debug.status && (
            <BodyMedium>
              {debug.status.supported
                ? debug.status.enabled
                  ? "iPhone Live Activities: allowed"
                  : "Live Activities are disabled in iPhone Settings"
                : "This device does not support iPhone Live Activities"}
              .{" "}
              {debug.status.active
                ? "An activity is active."
                : "No activity is active."}
            </BodyMedium>
          )}
          {debug.backgroundReady === false && (
            <BodyMedium>
              Background updates are not configured on this server. Apple push
              credentials are required; opening Collection still refreshes
              assignments.
            </BodyMedium>
          )}
          {debug.backgroundReady === true && (
            <BodyMedium>Server background updates are configured.</BodyMedium>
          )}
          <BodyMedium>
            Mode:{" "}
            {debug.mode === "live"
              ? "Real scout assignments"
              : "Sample preview (not sent to the server)"}
          </BodyMedium>
          {debug.state && (
            <BodyMedium>
              Next: {debug.state.assignments[0].matchLabel} · scout team{" "}
              {debug.state.assignments[0].teamNumber}
            </BodyMedium>
          )}
          {debug.error && <BodyMedium>{debug.error}</BodyMedium>}
          {debug.status?.registrationError && (
            <BodyMedium>{debug.status.registrationError}</BodyMedium>
          )}
          <Button disabled={!liveActivities} onPress={() => preview("waiting")}>
            Preview before shift
          </Button>
          <Button disabled={!liveActivities} onPress={() => preview("onShift")}>
            Preview on shift
          </Button>
          <Button disabled={!liveActivities} onPress={() => preview("live")}>
            Use real assignments / refresh
          </Button>
          <Button disabled={!liveActivities} onPress={stopLiveActivities}>
            End Live Activity and disable
          </Button>
          <BodyMedium>
            Hold the compact Dynamic Island to see the expanded layout. Previews
            use sample data and never change your scouting schedule.
          </BodyMedium>
        </SafeAreaView>
      </ScrollView>
    </>
  );
}

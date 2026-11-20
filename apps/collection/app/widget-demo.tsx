import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavBar } from "../lib/components/NavBar";
import { IconButton } from "../lib/components/IconButton";
import Button from "../lib/components/Button";
import BodyMedium from "../lib/components/text/BodyMedium";
import TitleMedium from "../lib/components/text/TitleMedium";
import { colors } from "../lib/colors";
import {
  ScoutingWidgetPreview,
  WidgetDemoPhase,
  WidgetDemoSize,
  widgetDemoDimensions,
} from "../lib/liveActivities/ScoutingWidgetPreview";

export default function WidgetDemo() {
  const [size, setSize] = useState<WidgetDemoSize>("medium");
  const [phase, setPhase] = useState<WidgetDemoPhase>("waiting");
  const dimensions = widgetDemoDimensions[size];
  return (
    <>
      <NavBar
        title="Widget demo"
        left={
          <IconButton
            icon="arrow_back_ios"
            label="Back"
            color={colors.onBackground.default}
            onPress={() => router.back()}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <SafeAreaView edges={["bottom"]} style={{ gap: 16 }}>
          <TitleMedium>Home Screen widgets</TitleMedium>
          <BodyMedium>
            Sample data only. These previews do not change your assignments or
            start a Live Activity.
          </BodyMedium>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              flex={1}
              variant={size === "small" ? "primary" : "secondary"}
              onPress={() => setSize("small")}
            >
              Small
            </Button>
            <Button
              flex={1}
              variant={size === "medium" ? "primary" : "secondary"}
              onPress={() => setSize("medium")}
            >
              Medium
            </Button>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              flex={1}
              variant={phase === "waiting" ? "primary" : "secondary"}
              onPress={() => setPhase("waiting")}
            >
              Before shift
            </Button>
            <Button
              flex={1}
              variant={phase === "onShift" ? "primary" : "secondary"}
              onPress={() => setPhase("onShift")}
            >
              On scout
            </Button>
          </View>
          <BodyMedium>
            {dimensions.width} × {dimensions.height} pt ·{" "}
            {phase === "waiting" ? "Before shift" : "On scout"}
          </BodyMedium>
          <ScrollView
            horizontal
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            <ScoutingWidgetPreview size={size} phase={phase} />
          </ScrollView>
          <BodyMedium>
            Widget sizes vary by iPhone model. The installed widgets adapt to
            the space iOS provides.
          </BodyMedium>
          <TitleMedium>Try on the Home Screen</TitleMedium>
          <BodyMedium>
            On iOS 17 or later, hold an empty area of the Home Screen, choose
            Edit → Add Widget, and search for Collection. Add “Scouting demo” in
            small or medium size. Hold the widget and choose Edit Widget to
            select Before shift or On scout.
          </BodyMedium>
          <BodyMedium>
            The installed demo also uses sample data. Real Home Screen
            assignment updates are not connected yet.
          </BodyMedium>
        </SafeAreaView>
      </ScrollView>
    </>
  );
}

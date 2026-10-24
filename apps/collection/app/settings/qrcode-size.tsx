import { View } from "react-native";
import { NavBar } from "../../lib/components/NavBar";
import { IconButton } from "../../lib/components/IconButton";
import { router } from "expo-router";
import { colors } from "../../lib/colors";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScoutReportCode } from "../../lib/collection/ui/ScoutReportCode";
import { Suspense } from "react";
import { ScoutReport } from "../../lib/collection/ScoutReport";
import { useQrCodeSizeStore } from "../../lib/storage/userStores";
import Slider from "@react-native-community/slider";
import LabelSmall from "../../lib/components/text/LabelSmall";
import React from "react";
import { initialPostMatch } from "../../lib/collection/ChargedUp";

const EXAMPLE_SCOUT_REPORT: ScoutReport = {
  ...initialPostMatch,
  gameYear: 2023,
  uuid: "f23698c6-a084-4659-9644-fc91c9f88d14",
  tournamentKey: "2023caoc",
  matchType: "PRACTICE",
  matchNumber: 58,
  startTime: 1680300000000,
  teamNumber: 8033,
  scouterUuid: "034d8eda-d579-4e83-9ccf-53bebab38724",
  fieldPieces: ["CONE", "CUBE", "UNKNOWN", "CONE"],
  events: [
    {
      time: 0,
      action: "START_POSITION",
      location: "START_POSITION",
      position: 50,
    },
    {
      time: 3.5,
      action: "SCORE_CONE",
      location: "SCORE",
      scoringLocation: "A1",
    },
    { time: 7.2, action: "LEAVE_ZONE", location: "ALLIANCE_ZONE" },
    { time: 10.1, action: "INTAKE_CUBE", location: "CENTER" },
    { time: 14.9, action: "ENTER_ZONE", location: "ALLIANCE_ZONE" },
    {
      time: 18.1,
      action: "SCORE_CUBE",
      location: "SCORE",
      scoringLocation: "H2",
    },
  ],
};

export default function QRCodeSizeEditor() {
  return (
    <>
      <NavBar
        title="QR Code Size"
        left={
          <IconButton
            icon="arrow_back_ios"
            label="Back"
            onPress={() => {
              router.back();
            }}
            color={colors.onBackground.default}
          />
        }
      />
      <Suspense>
        <Body />
      </Suspense>
    </>
  );
}

const Body = () => {
  const qrCodeSize = useQrCodeSizeStore((state) => state.value);
  const setQRCodeSize = useQrCodeSizeStore((state) => state.setValue);
  console.log({ qrCodeSize });

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, gap: 7 }}
    >
      <View style={{ flex: 1, maxWidth: 450 }}>
        <ScoutReportCode scoutReport={EXAMPLE_SCOUT_REPORT} />
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            gap: 7,
            padding: 16,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <LabelSmall>Quicker scans</LabelSmall>
            <LabelSmall>Fewer codes</LabelSmall>
          </View>
          <Slider
            minimumValue={100}
            maximumValue={800}
            step={1}
            value={qrCodeSize}
            onSlidingComplete={(value) => {
              setQRCodeSize(value);
            }}
            minimumTrackTintColor={colors.gray.default}
            maximumTrackTintColor={colors.gray.default}
            thumbTintColor={colors.onBackground.default}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

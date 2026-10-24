import { View, Image, Pressable } from "react-native";
import { colors } from "../../colors";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "react-native";
import LabelSmall from "../../components/text/LabelSmall";
import {
  AllianceColor,
  getAllianceColorDescription,
} from "../../models/AllianceColor";
import { IconButton } from "../../components/IconButton";
import * as Haptics from "expo-haptics";
import { GameTimer } from "./GameTimer";
import * as DropdownMenu from "zeego/dropdown-menu";
import { useReportStateStore } from "../reportStateStore";
import React from "react";
import { activeActivity, heldPiece } from "../ChargedUp";
const pieceImages = {
  CONE: require("../../../assets/charged-up/score-cone.png"),
  CUBE: require("../../../assets/charged-up/scoreCube.png"),
};

export const GameViewTemplate = (props: {
  field: React.ReactNode;
  topLeftReplacement?: React.ReactNode;
  gamePhaseMessage: string;
  startEnabled?: boolean;
  onExit: () => void;
  onEnd: () => void;
  onRestart: () => void;
}) => {
  const reportState = useReportStateStore();
  const { gamePhaseMessage, field, startEnabled } = props;
  const piece = heldPiece(reportState.events, reportState.preloadedPiece);
  if (!reportState.meta) return null;

  return (
    <>
      <View
        style={{
          backgroundColor: colors.secondaryContainer.default,
          paddingVertical: 7,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <SafeAreaView
          // This landscape screen hides the status bar. A portrait top inset can
          // otherwise remain here during the first orientation transition.
          edges={["left", "right"]}
          style={{
            flex: 1,
            // Keep the icons and their expanded touch areas inside the safe edges.
            paddingHorizontal: 28,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Left as null incase something should be added here */}
          {props.topLeftReplacement ?? (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
              }}
            >
              <IconButton
                icon="undo"
                label="Undo"
                color={colors.onBackground.default}
                disabled={
                  reportState.events.length === 0 ||
                  !!activeActivity(reportState.events)
                }
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  reportState.undoEvent();
                }}
              />
            </View>
          )}

          {reportState.startTimestamp ? (
            <View
              accessibilityLabel={
                piece ? `Holding ${piece.toLowerCase()}` : "No game piece"
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginHorizontal: 12,
              }}
            >
              {piece && (
                <Image
                  source={pieceImages[piece]}
                  resizeMode="contain"
                  style={{ width: 28, height: 28 }}
                />
              )}
              <LabelSmall>
                {piece ? (piece === "CONE" ? "Cone" : "Cube") : "No piece"}
              </LabelSmall>
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginHorizontal: 12,
              }}
            >
              <LabelSmall>Preload</LabelSmall>
              {([null, "CONE", "CUBE"] as const).map((value) => (
                <Pressable
                  key={value ?? "none"}
                  accessibilityRole="button"
                  accessibilityLabel={`Preload ${value?.toLowerCase() ?? "none"}`}
                  accessibilityState={{ selected: piece === value }}
                  onPress={() => reportState.setPreloadedPiece(value)}
                  style={{
                    padding: 5,
                    borderRadius: 6,
                    backgroundColor:
                      piece === value
                        ? colors.victoryPurple.default
                        : "transparent",
                  }}
                >
                  {value ? (
                    <Image
                      source={pieceImages[value]}
                      resizeMode="contain"
                      style={{ width: 24, height: 24 }}
                    />
                  ) : (
                    <LabelSmall>None</LabelSmall>
                  )}
                </Pressable>
              ))}
            </View>
          )}
          <View
            style={{ alignItems: "flex-end", gap: 2, flex: 1, marginRight: 13 }}
          >
            <View
              style={{
                backgroundColor: getAllianceColorDescription(
                  reportState?.meta.allianceColor ?? AllianceColor.Red,
                ).backgroundColor,
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  color: getAllianceColorDescription(
                    reportState?.meta.allianceColor ?? AllianceColor.Red,
                  ).foregroundColor,
                  fontFamily: "Heebo_500Medium",
                  fontSize: 12,
                }}
              >
                {reportState?.meta.teamNumber}
              </Text>
            </View>
            <LabelSmall color={colors.body.default}>
              {gamePhaseMessage} •{" "}
              <GameTimer startTime={reportState?.startTimestamp} />
            </LabelSmall>
          </View>

          {!reportState?.startTimestamp && (
            <IconButton
              label="Start match"
              icon="play_arrow"
              color={colors.onBackground.default}
              size={30}
              disabled={!startEnabled}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                reportState.initializeMatchTimestamp();
              }}
            />
          )}

          {reportState?.startTimestamp && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  label="End match"
                  icon="stop"
                  color={colors.onBackground.default}
                  size={30}
                />
              </DropdownMenu.Trigger>

              <DropdownMenu.Content
                loop={false}
                side="bottom"
                align="end"
                alignOffset={0}
                avoidCollisions={true}
                collisionPadding={0}
                sideOffset={0}
              >
                <DropdownMenu.Item key="end" onSelect={props.onEnd}>
                  <DropdownMenu.ItemTitle>End match</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
                <DropdownMenu.Item key="exit" onSelect={props.onExit}>
                  <DropdownMenu.ItemTitle>Exit match</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
                <DropdownMenu.Item key="restart" onSelect={props.onRestart}>
                  <DropdownMenu.ItemTitle>Restart match</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
        </SafeAreaView>
      </View>
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1 }}>
        {field}
      </SafeAreaView>
    </>
  );
};

import React, { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  ImageSourcePropType,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useReportStateStore } from "../reportStateStore";
import { gameHeaderAssets, GameViewTemplate } from "./GameViewTemplate";
import { GamePhase } from "../ReportState";
import {
  AUTO_END_SECONDS,
  ENDGAME_START_SECONDS,
  MATCH_END_SECONDS,
  currentLocation,
  heldPiece,
  FieldLocation,
  activeActivity,
  canScoreAt,
  onCharger,
} from "../ChargedUp";
import { IconButton } from "../../components/IconButton";
import { colors } from "../../colors";
import {
  FieldOrientation,
  useFieldOrientationStore,
} from "../../storage/userStores";
import { AllianceColor } from "../../models/AllianceColor";

const assets = {
  selectionField: require("../../../assets/charged-up/selection-field.png"),
  scoreCone: require("../../../assets/charged-up/score-cone.png"),
  intakeCone: require("../../../assets/charged-up/intake-cone.png"),
  intakeCube: require("../../../assets/charged-up/intake-cube.png"),
  field: require("../../../assets/charged-up/field.png"),
  zone: require("../../../assets/charged-up/zone.png"),
  cone: require("../../../assets/charged-up/cone.png"),
  cube: require("../../../assets/charged-up/cube.png"),
  scoreCube: require("../../../assets/charged-up/scoreCube.png"),
  upload: require("../../../assets/charged-up/upload.png"),
  drop: require("../../../assets/charged-up/drop.png"),
  rightArrow: require("../../../assets/charged-up/right-arrow.png"),
  arrow: require("../../../assets/charged-up/arrow.png"),
  shield: require("../../../assets/charged-up/shield.png"),
};
type Panel = null | "intake" | "score";
// Figma uses a fixed 852 × 393 canvas, including its 59 px top bar.
const gridColumns = [
  { x: 15, width: 253 },
  { x: 300, width: 252 },
  { x: 584, width: 253 },
];
const gridRows = [
  { y: 2.921, height: 97.957 },
  { y: 116.026, height: 98.967 },
  { y: 229.132, height: 97.957 },
];
const coneIconPositions = [
  [
    [123, 97],
    [407, 94],
    [692, 94],
  ],
  [
    [123, 207],
    [407, 207],
    [692, 204],
  ],
  [
    [120, 312],
    [406, 319],
    [692, 313],
  ],
];
const cubeIconPositions = [
  [
    [123, 94],
    [407, 94],
    [692, 94],
  ],
  [
    [123, 207],
    [407, 207],
    [692, 207],
  ],
  [
    [120, 312],
    [406, 319],
    [692, 313],
  ],
];
const green = "rgba(156,255,154,0.3)";
const purple = "rgba(181,154,255,0.3)";
const yellow = "rgba(193,195,55,0.3)";

export function Game() {
  const state = useReportStateStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [intakeLocation, setIntakeLocation] = useState<FieldLocation>("CENTER");
  const [scoringArea, setScoringArea] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const location = currentLocation(state.events);
  const piece = heldPiece(state.events, state.preloadedPiece);
  const activity = activeActivity(state.events);
  const charging = onCharger(state.events);
  const chargerShade = useSharedValue(charging ? 1 : 0);
  const chargerShadeStyle = useAnimatedStyle(() => ({
    opacity: chargerShade.value,
  }));
  useEffect(() => {
    chargerShade.value = withTiming(charging ? 1 : 0, {
      duration: 100,
      reduceMotion: ReduceMotion.System,
    });
  }, [charging, chargerShade]);
  // Charge-station path centers mapped through the background image bounds.
  const chargerCenterX =
    state.meta?.allianceColor === AllianceColor.Blue
      ? 15 + (221.869 + 360.061) / 2
      : -408 + (((583.436 + 674.676) / 2) * 1245) / 822;
  const chargerCenterY = -142.438 + (230.69 + 361.571) / 2;
  const started = !!state.startTimestamp;
  const inZone = location === "ALLIANCE_ZONE";
  const orientation = useFieldOrientationStore((s) => s.value);
  const reversed =
    (state.meta?.allianceColor === AllianceColor.Red) !==
    (orientation === FieldOrientation.Sinister);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") useReportStateStore.getState().stopHold();
    });
    return () => {
      subscription.remove();
      useReportStateStore.getState().stopHold();
    };
  }, []);
  useEffect(() => {
    if (!state.meta) router.replace("/home");
  }, [state.meta]);
  useEffect(() => {
    if (!state.startTimestamp) {
      setElapsed(0);
      return;
    }
    const start = state.startTimestamp.getTime();
    const tick = () => {
      const seconds = (Date.now() - start) / 1000;
      setElapsed(seconds);
      const phase =
        seconds < AUTO_END_SECONDS
          ? GamePhase.Auto
          : seconds < ENDGAME_START_SECONDS
            ? GamePhase.Teleop
            : GamePhase.Endgame;
      state.setGamePhase(phase);
      if (seconds >= MATCH_END_SECONDS) {
        useReportStateStore.getState().stopHold();
        router.replace("/game/post-match");
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state.startTimestamp]);

  const exit = () => {
    state.stopHold();
    if (!started) {
      state.reset();
      return;
    }
    Alert.alert(
      "Exit match?",
      "This discards the current report and returns Home.",
      [
        { text: "Keep scouting", style: "cancel" },
        {
          text: "Exit match",
          style: "destructive",
          onPress: () => state.reset(),
        },
      ],
    );
  };
  const intake = (at: FieldLocation) => {
    if (piece || activity || charging) return;
    setIntakeLocation(at);
    setPanel("intake");
  };
  const move = (to: FieldLocation) => {
    state.addEvent({
      action: to === "CENTER" ? "LEAVE_ZONE" : "ENTER_ZONE",
      location: to === "CENTER" ? location : to,
    });
  };
  const score = (area: number) => {
    if (!piece || activity || charging) return;
    setScoringArea(area);
    setPanel("score");
  };
  const endgameAvailable =
    elapsed < AUTO_END_SECONDS || elapsed >= ENDGAME_START_SECONDS;

  return (
    <GameViewTemplate
      fieldControlsLocked={charging}
      gamePhaseMessage={
        !started ? "Pre-match" : elapsed < AUTO_END_SECONDS ? "Auto" : "Teleop"
      }
      startEnabled={state.startPosition !== undefined}
      topLeftReplacement={
        !started ? (
          <View style={{ flex: 1 }}>
            <IconButton
              icon="close"
              label="Exit scout report"
              color={colors.onBackground.default}
              onPress={exit}
            />
          </View>
        ) : panel ? (
          <View style={{ flex: 1, flexDirection: "row", gap: 16 }}>
            <IconButton
              icon="arrow_back"
              size={30}
              label="Close selection"
              color={colors.onBackground.default}
              onPress={() => setPanel(null)}
            />
            <IconButton
              icon="undo"
              image={gameHeaderAssets.undo}
              size={30}
              label="Undo"
              color={colors.onBackground.default}
              disabled={state.events.length === 0 || charging}
              onPress={state.undoEvent}
            />
          </View>
        ) : inZone && !piece ? (
          <View style={{ flex: 1, flexDirection: "row", gap: 16 }}>
            <IconButton
              icon="undo"
              image={gameHeaderAssets.undo}
              size={30}
              label="Undo"
              color={colors.onBackground.default}
              disabled={state.events.length === 0 || charging}
              onPress={state.undoEvent}
            />
            <IconButton
              icon="upload"
              size={30}
              label="Intake from alliance zone"
              disabled={charging}
              color={colors.onBackground.default}
              onPress={() => intake("ALLIANCE_ZONE")}
            />
          </View>
        ) : undefined
      }
      onEnd={() => {
        state.stopHold();
        setPanel(null);
        router.replace("/game/post-match");
      }}
      onExit={exit}
      onRestart={() =>
        Alert.alert(
          "Restart match?",
          "You will lose all of the data you recorded.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Restart",
              style: "destructive",
              onPress: () => {
                state.restartMatch();
                setPanel(null);
              },
            },
          ],
        )
      }
      field={
        <ScaledBoard>
          {panel === "score" ? (
            <>
              <Image
                source={assets.selectionField}
                style={{
                  position: "absolute",
                  left: 15,
                  top: 11,
                  width: 822,
                  height: 307,
                }}
              />
              {[1, 2, 3].flatMap((row, rowIndex) =>
                "ABCDEFGHI"
                  .slice(scoringArea * 3, scoringArea * 3 + 3)
                  .split("")
                  .map((column, columnIndex) => {
                    const enabled = canScoreAt(piece, `${column}${row}`);
                    const { x, width } = gridColumns[columnIndex];
                    const { y, height } = gridRows[rowIndex];
                    const cone = piece === "CONE";
                    const [iconX, iconY] = (
                      cone ? coneIconPositions : cubeIconPositions
                    )[rowIndex][columnIndex];
                    return (
                      <Pressable
                        key={`${column}${row}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Score ${(piece ?? "piece").toLowerCase()} at ${column}${row}`}
                        accessibilityState={{ disabled: !enabled }}
                        disabled={!enabled}
                        style={{
                          position: "absolute",
                          left: x,
                          top: y,
                          width,
                          height,
                          borderRadius: 7,
                          backgroundColor: enabled
                            ? "rgba(156,255,154,0.5)"
                            : green,
                        }}
                        onPress={() => {
                          if (
                            state.addEvent({
                              action: cone ? "SCORE_CONE" : "SCORE_CUBE",
                              location: "SCORE",
                              scoringLocation: `${column}${row}`,
                            })
                          )
                            setPanel(null);
                        }}
                      >
                        {enabled && (
                          <Image
                            source={cone ? assets.scoreCone : assets.scoreCube}
                            resizeMode="contain"
                            style={{
                              position: "absolute",
                              left: iconX - x - 1.75,
                              top: iconY - 59 - y - 1.75,
                              width: 41.5,
                              height: 43.5,
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  }),
              )}
            </>
          ) : panel !== "intake" ? (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 852,
                  height: 334,
                  overflow: "hidden",
                  transform: [
                    {
                      rotate:
                        orientation === FieldOrientation.Sinister
                          ? "180deg"
                          : "0deg",
                    },
                  ],
                }}
              >
                <Image
                  source={
                    started &&
                    inZone &&
                    state.meta?.allianceColor === AllianceColor.Blue
                      ? assets.zone
                      : assets.field
                  }
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    left:
                      started &&
                      inZone &&
                      state.meta?.allianceColor === AllianceColor.Red
                        ? -408
                        : 15,
                    top: started && inZone ? -142.438 : started ? 14 : 1.5,
                    width: started && inZone ? 1245 : 822,
                    height: started && inZone ? 460.438 : 304,
                  }}
                />
              </View>
              {!started ? (
                <>
                  <View
                    style={{
                      position: "absolute",
                      left: reversed ? 700 : 92,
                      top:
                        orientation === FieldOrientation.Sinister
                          ? 38.5
                          : 110.5,
                      width: 60,
                      height: 185,
                      borderRadius: 7,
                      backgroundColor: "#e0e0e04d",
                    }}
                    accessibilityRole="adjustable"
                    accessibilityLabel="Starting position"
                    accessibilityValue={{
                      min: 0,
                      max: 100,
                      now: state.startPosition ?? 50,
                    }}
                    accessibilityActions={[
                      { name: "increment" },
                      { name: "decrement" },
                    ]}
                    onAccessibilityAction={(e) =>
                      state.setStartPosition(
                        (state.startPosition ?? 50) +
                          (e.nativeEvent.actionName === "increment" ? 5 : -5),
                      )
                    }
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) =>
                      state.setStartPosition(
                        (orientation === FieldOrientation.Sinister
                          ? 1 - e.nativeEvent.locationY / 185
                          : e.nativeEvent.locationY / 185) * 100,
                      )
                    }
                    onResponderMove={(e) =>
                      state.setStartPosition(
                        (orientation === FieldOrientation.Sinister
                          ? 1 - e.nativeEvent.locationY / 185
                          : e.nativeEvent.locationY / 185) * 100,
                      )
                    }
                  >
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        width: 60,
                        height: 45,
                        borderRadius: 7,
                        backgroundColor: "#e0e0e0cc",
                        top:
                          ((orientation === FieldOrientation.Sinister
                            ? 100 - (state.startPosition ?? 50)
                            : (state.startPosition ?? 50)) /
                            100) *
                          140,
                      }}
                    />
                  </View>
                  {state.fieldPieces.map((fieldPiece, i) => (
                    <BoardButton
                      key={i}
                      x={357}
                      y={[58, 118, 180, 239][i]}
                      w={45}
                      h={45}
                      reversed={reversed}
                      label={`Pre-match piece ${i + 1}: ${fieldPiece.toLowerCase()}`}
                      color={fieldPiece === "UNKNOWN" ? yellow : "transparent"}
                      asset={
                        fieldPiece === "CONE"
                          ? assets.cone
                          : fieldPiece === "CUBE"
                            ? assets.cube
                            : undefined
                      }
                      text={fieldPiece === "UNKNOWN" ? "?" : undefined}
                      textStyle={{
                        fontSize: 24,
                        fontFamily: "Heebo_500Medium",
                        color: "rgba(255,255,255,0.3)",
                      }}
                      onPress={() => state.setFieldPiece(i)}
                    />
                  ))}
                </>
              ) : inZone ? (
                <>
                  {[16, 113, 210].map((y, index) => (
                    <BoardButton
                      key={y}
                      x={35}
                      y={y}
                      w={186}
                      h={91}
                      reversed={reversed}
                      label={`Scoring area ${index + 1}`}
                      disabled={!piece || !!activity || charging}
                      color={
                        state.meta?.allianceColor === AllianceColor.Blue
                          ? "transparent"
                          : green
                      }
                      onPress={() => score(index)}
                    />
                  ))}
                  <BoardButton
                    x={394}
                    y={8}
                    w={228}
                    h={295}
                    reversed={reversed}
                    label="Leave alliance zone"
                    disabled={!!activity || charging}
                    color={purple}
                    asset={assets.rightArrow}
                    assetOffset={{ x: 0, y: 3.5 }}
                    onPress={() => move("CENTER")}
                  />
                  {(endgameAvailable || charging) && (
                    <BoardButton
                      x={chargerCenterX - 116 / 2}
                      y={chargerCenterY - 115 / 2}
                      w={116}
                      h={115}
                      reversed={orientation === FieldOrientation.Sinister}
                      label={
                        charging ? "Leave charge station" : "Charge station"
                      }
                      active={charging}
                      activeColor="rgba(181,154,255,0.6)"
                      raised={charging}
                      color={purple}
                      onPress={() =>
                        state.addEvent({
                          action: charging ? "LEAVE_CHARGER" : "ENDGAME",
                          location: "CHARGER",
                        })
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  <BoardButton
                    x={33}
                    y={23}
                    w={232}
                    h={83}
                    reversed={reversed}
                    label="Hold to defend"
                    active={
                      activity === "DEFENDING" &&
                      state.events.at(-1)?.location === "OPPONENT_ZONE"
                    }
                    onPressIn={() => state.startHold("OPPONENT_ZONE")}
                    onPressOut={() => state.stopHold("OPPONENT_ZONE")}
                    color="#292929"
                    asset={assets.shield}
                    onPress={() => {}}
                  />
                  <BoardButton
                    x={33}
                    y={122}
                    w={232}
                    h={184}
                    reversed={reversed}
                    label="Enter alliance zone"
                    disabled={!!activity}
                    color={purple}
                    asset={assets.arrow}
                    onPress={() => move("ALLIANCE_ZONE")}
                  />
                  <BoardButton
                    x={343}
                    y={32}
                    w={165}
                    h={272}
                    reversed={reversed}
                    label="Intake from ground"
                    disabled={!!piece || !!activity}
                    color={yellow}
                    asset={assets.upload}
                    onPress={() => intake("CENTER")}
                  />
                  <BoardButton
                    x={515}
                    y={32}
                    w={96}
                    h={272}
                    reversed={reversed}
                    label="Hold to defend at opponent station"
                    active={
                      activity === "DEFENDING" &&
                      state.events.at(-1)?.location === "OPPONENT_STATION"
                    }
                    onPressIn={() => state.startHold("OPPONENT_STATION")}
                    onPressOut={() => state.stopHold("OPPONENT_STATION")}
                    color="#292929"
                    asset={assets.shield}
                    onPress={() => {}}
                  />
                  <BoardButton
                    x={687}
                    y={23}
                    w={133}
                    h={85}
                    reversed={reversed}
                    label="Intake from alliance station"
                    disabled={!!piece || !!activity}
                    color={yellow}
                    asset={assets.upload}
                    onPress={() => intake("ALLIANCE_STATION")}
                  />
                  <BoardButton
                    x={616}
                    y={219}
                    w={133}
                    h={85}
                    reversed={reversed}
                    label="Drop game piece"
                    disabled={!piece || !!activity}
                    color={green}
                    asset={assets.drop}
                    onPress={() => state.addEvent({ action: "DROP", location })}
                  />
                  {location !== "CENTER" && (
                    <BoardButton
                      x={622}
                      y={122}
                      w={198}
                      h={83}
                      reversed={reversed}
                      label="Return to center"
                      color={purple}
                      text="Center"
                      onPress={() => move("CENTER")}
                    />
                  )}
                </>
              )}
            </>
          ) : null}
          {panel === "intake" && (
            <>
              <Image
                source={assets.selectionField}
                style={{
                  position: "absolute",
                  left: 15,
                  top: 11,
                  width: 822,
                  height: 307,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 15,
                  right: 15,
                  top: 3,
                  bottom: 20,
                  flexDirection: "row",
                  gap: 26,
                }}
              >
                {(["CONE", "CUBE"] as const).map((p) => (
                  <Pressable
                    key={p}
                    accessibilityRole="button"
                    accessibilityLabel={`Intake ${p.toLowerCase()}`}
                    style={[
                      styles.cell,
                      { backgroundColor: "rgba(156,255,154,0.5)" },
                    ]}
                    onPress={() => {
                      if (
                        state.addEvent({
                          action: p === "CONE" ? "INTAKE_CONE" : "INTAKE_CUBE",
                          location: intakeLocation,
                        })
                      )
                        setPanel(null);
                    }}
                  >
                    <Image
                      source={
                        p === "CONE" ? assets.intakeCone : assets.intakeCube
                      }
                      resizeMode="contain"
                      style={{
                        position: "absolute",
                        left: 161.5,
                        top: p === "CONE" ? 121.5 : 122.5,
                        width: 83,
                        height: 87,
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: "rgba(31,31,31,0.65)",
                zIndex: 1,
              },
              chargerShadeStyle,
            ]}
          />
        </ScaledBoard>
      }
    />
  );
}

function ScaledBoard({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState({ width: 852, height: 334 });
  const scale = Math.min(size.width / 852, size.height / 334);
  return (
    <View
      testID="scouting-field"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      onLayout={(e: LayoutChangeEvent) => setSize(e.nativeEvent.layout)}
    >
      <View style={{ width: 852 * scale, height: 334 * scale }}>
        <View
          style={{
            width: 852,
            height: 334,
            overflow: "hidden",
            transform: [{ scale }],
            transformOrigin: "top left",
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}
function BoardButton({
  x,
  y,
  w,
  h,
  label,
  color,
  asset,
  text,
  textStyle,
  assetOffset,
  onPress,
  onPressIn,
  onPressOut,
  disabled = false,
  active = false,
  activeColor = colors.danger.default,
  raised = false,
  reversed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  asset?: ImageSourcePropType;
  text?: string;
  textStyle?: import("react-native").TextStyle;
  assetOffset?: { x: number; y: number };
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  active?: boolean;
  activeColor?: string;
  raised?: boolean;
  reversed: boolean;
}) {
  const orientation = useFieldOrientationStore((s) => s.value);
  const pressScale = useSharedValue(1);
  const feedbackStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  useEffect(() => {
    if (disabled) pressScale.value = 1;
  }, [disabled, pressScale]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPressIn={() => {
        pressScale.value = withTiming(0.975, {
          duration: 65,
          reduceMotion: ReduceMotion.System,
        });
        if (onPressIn) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressIn();
        }
      }}
      onPressOut={() => {
        pressScale.value = withTiming(1, {
          duration: 90,
          reduceMotion: ReduceMotion.System,
        });
        onPressOut?.();
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        position: "absolute",
        left: reversed ? 852 - x - w : x,
        top: orientation === FieldOrientation.Sinister ? 334 - y - h : y,
        width: w,
        height: h,
        zIndex: raised ? 2 : 0,
      }}
    >
      {/* Keep the touch target fixed while its artwork animates. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: active ? activeColor : color,
            opacity: disabled ? 0.35 : 1,
            borderWidth: active ? 3 : 0,
            borderColor: "#e0e0e0",
            borderRadius: 7,
            alignItems: "center",
            justifyContent: "center",
          },
          feedbackStyle,
        ]}
      >
        {asset && (
          <Image
            source={asset}
            resizeMode="contain"
            style={{
              width:
                asset === assets.arrow || asset === assets.rightArrow
                  ? 32
                  : asset === assets.shield
                    ? 40
                    : w === 45
                      ? 45
                      : 42,
              height:
                asset === assets.arrow || asset === assets.rightArrow
                  ? 32
                  : asset === assets.shield
                    ? 40
                    : w === 45
                      ? 45
                      : 42,
              transform: [
                { translateX: assetOffset?.x ?? 0 },
                { translateY: assetOffset?.y ?? 0 },
                {
                  rotate:
                    asset === assets.drop ||
                    (asset === assets.rightArrow && !reversed) ||
                    (asset === assets.arrow && reversed)
                      ? "180deg"
                      : "0deg",
                },
              ],
            }}
          />
        )}
        {text && <Text style={[styles.gridLabel, textStyle]}>{text}</Text>}
      </Animated.View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  cell: {
    flex: 1,
    backgroundColor: green,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: { color: "#e0e0e0", fontSize: 28, fontFamily: "Heebo_400Regular" },
});

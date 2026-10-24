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
import * as Haptics from "expo-haptics";
import { useReportStateStore } from "../reportStateStore";
import { GameViewTemplate } from "./GameViewTemplate";
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
  camp: require("../../../assets/charged-up/camp.png"),
};
type Panel = null | "intake" | "score" | "charger";
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
    if (piece || activity) return;
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
    if (!piece || activity) return;
    setScoringArea(area);
    setPanel("score");
  };
  const endgameAvailable =
    elapsed < AUTO_END_SECONDS || elapsed >= ENDGAME_START_SECONDS;

  return (
    <GameViewTemplate
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
              <View
                style={{
                  position: "absolute",
                  left: 15,
                  right: 15,
                  top: 8,
                  bottom: 8,
                  gap: 14,
                }}
              >
                {[1, 2, 3].map((row) => (
                  <View
                    key={row}
                    style={{ flex: 1, flexDirection: "row", gap: 9 }}
                  >
                    {"ABCDEFGHI"
                      .slice(scoringArea * 3, scoringArea * 3 + 3)
                      .split("")
                      .map((column) => (
                        <Pressable
                          key={column}
                          accessibilityRole="button"
                          accessibilityLabel={`Score ${(piece ?? "piece").toLowerCase()} at ${column}${row}`}
                          disabled={!canScoreAt(piece, `${column}${row}`)}
                          accessibilityState={{
                            disabled: !canScoreAt(piece, `${column}${row}`),
                          }}
                          style={[
                            styles.cell,
                            {
                              backgroundColor: canScoreAt(
                                piece,
                                `${column}${row}`,
                              )
                                ? "rgba(156,255,154,0.5)"
                                : green,
                            },
                          ]}
                          onPress={() => {
                            state.addEvent({
                              action:
                                piece === "CONE" ? "SCORE_CONE" : "SCORE_CUBE",
                              location: "SCORE",
                              scoringLocation: `${column}${row}`,
                            });
                            setPanel(null);
                          }}
                        >
                          {canScoreAt(piece, `${column}${row}`) && (
                            <Image
                              source={
                                piece === "CONE"
                                  ? assets.scoreCone
                                  : assets.scoreCube
                              }
                              resizeMode="contain"
                              style={{ width: 40, height: 40 }}
                            />
                          )}
                          <Text style={[styles.gridLabel, { fontSize: 18 }]}>
                            {column}
                            {row}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                ))}
              </View>
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
                    top: started && inZone ? -142 : 14,
                    width: started && inZone ? 1245 : 822,
                    height: started && inZone ? 460 : 304,
                  }}
                />
              </View>
              {!started ? (
                <>
                  <View
                    style={{
                      position: "absolute",
                      left: reversed ? 700 : 92,
                      top: orientation === FieldOrientation.Sinister ? 24 : 125,
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
                      y={58 + i * 60}
                      w={45}
                      h={45}
                      reversed={reversed}
                      label={`Pre-match piece ${i + 1}: ${fieldPiece.toLowerCase()}`}
                      color={fieldPiece === "UNKNOWN" ? yellow : green}
                      asset={
                        fieldPiece === "CONE"
                          ? assets.cone
                          : fieldPiece === "CUBE"
                            ? assets.cube
                            : undefined
                      }
                      text={fieldPiece === "UNKNOWN" ? "?" : undefined}
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
                      disabled={!piece || !!activity}
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
                    h={294}
                    reversed={reversed}
                    label="Leave alliance zone"
                    disabled={!!activity}
                    color={purple}
                    asset={assets.rightArrow}
                    onPress={() => move("CENTER")}
                  />
                  {endgameAvailable && (
                    <BoardButton
                      x={242}
                      y={97}
                      w={129}
                      h={122}
                      reversed={reversed}
                      label="Charge station"
                      color={purple}
                      onPress={() => setPanel("charger")}
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
                    active={activity === "DEFENDING"}
                    onPressIn={() =>
                      state.startHold("DEFENDING", "OPPONENT_ZONE")
                    }
                    onPressOut={state.stopHold}
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
                    w={80}
                    h={272}
                    reversed={reversed}
                    label="Hold to camp"
                    active={activity === "CAMPING"}
                    onPressIn={() =>
                      state.startHold("CAMPING", "OPPONENT_STATION")
                    }
                    onPressOut={state.stopHold}
                    color="rgba(29,163,246,0.3)"
                    asset={assets.camp}
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
          {started && inZone && !panel && (
            <BoardButton
              x={660}
              y={230}
              w={165}
              h={70}
              label="Select game piece"
              disabled={!!piece || !!activity}
              reversed={reversed}
              color={yellow}
              asset={assets.upload}
              onPress={() => intake("ALLIANCE_ZONE")}
            />
          )}
          {panel && panel !== "intake" && (
            <BoardButton
              x={795}
              y={4}
              w={42}
              h={42}
              label="Close selection"
              color="#292929"
              text="×"
              onPress={() => setPanel(null)}
            />
          )}
          {panel === "intake" && (
            <>
              <Image
                source={assets.selectionField}
                style={{
                  position: "absolute",
                  left: 15,
                  top: 3,
                  width: 822,
                  height: 311,
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
                      style={{ width: 83, height: 87 }}
                    />
                  </Pressable>
                ))}
              </View>
              <BoardButton
                x={795}
                y={4}
                w={42}
                h={42}
                label="Close selection"
                color="#292929"
                text="×"
                onPress={() => setPanel(null)}
              />
            </>
          )}
          {panel === "charger" && (
            <View style={styles.overlay}>
              <Pressable
                style={styles.cell}
                accessibilityRole="button"
                onPress={() => {
                  state.addEvent({ action: "ENDGAME", location: "CHARGER" });
                  setPanel(null);
                }}
              >
                <Text style={styles.gridLabel}>Attempt charge</Text>
              </Pressable>
            </View>
          )}
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
  onPress,
  onPressIn,
  onPressOut,
  disabled = false,
  active = false,
  reversed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  asset?: ImageSourcePropType;
  text?: string;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  active?: boolean;
  reversed?: boolean;
}) {
  const orientation = useFieldOrientationStore((s) => s.value);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPressIn={
        onPressIn
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressIn();
            }
          : undefined
      }
      onPressOut={onPressOut}
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
        backgroundColor: color,
        opacity: disabled ? 0.35 : 1,
        borderWidth: active ? 3 : 0,
        borderColor: "#e0e0e0",
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {asset && (
        <Image
          source={asset}
          resizeMode="contain"
          style={{
            width:
              asset === assets.arrow || asset === assets.rightArrow
                ? 32
                : asset === assets.camp || asset === assets.shield
                  ? 40
                  : w === 45
                    ? 45
                    : 42,
            height:
              asset === assets.arrow || asset === assets.rightArrow
                ? 32
                : asset === assets.camp || asset === assets.shield
                  ? 40
                  : w === 45
                    ? 45
                    : 42,
            transform: [
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
      {text && <Text style={styles.gridLabel}>{text}</Text>}
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
  overlay: {
    position: "absolute",
    left: 65,
    right: 65,
    top: 50,
    bottom: 30,
    backgroundColor: "#1f1f1f",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    gap: 16,
  },
});

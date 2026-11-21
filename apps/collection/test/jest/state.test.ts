import { DefenseEffectiveness } from "../../lib/collection/DefenseEffectiveness";
import { Accuracy } from "../../lib/collection/Accuracy";
import { RobotRole } from "../../lib/collection/RobotRole";
import { ScoresWhileMoving } from "../../lib/collection/ScoresWhileMoving";
import { EndgameClimb } from "../../lib/collection/EndgameClimb";
import { Beached } from "../../lib/collection/Beached";
import { FeederType } from "../../lib/collection/FeederType";
import { IntakeType } from "../../lib/collection/IntakeType";
import { AutoClimb } from "../../lib/collection/AutoClimb";
import { FieldTraversal } from "../../lib/collection/FieldTraversal";
import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { useHistoryStore } from "../../lib/storage/historyStore";
import {
  useTeamStore,
  useTrainingModeStore,
} from "../../lib/storage/userStores";
import { migrateScoutReport } from "../../lib/storage/scoutReportMigrations";
import { scoutReportSchema } from "../../lib/collection/ScoutReport";
import { DriverAbility } from "../../lib/collection/DriverAbility";
import { MatchEventPosition } from "../../lib/collection/MatchEventPosition";
import { MatchEventType as Event } from "../../lib/collection/MatchEventType";
import { makeReport, meta } from "./fixtures";

jest.mock("../../lib/lovatAPI/reportLifecycle", () => ({
  syncReportLifecycle: jest.fn(async () => {}),
}));
beforeEach(() => {
  useReportStateStore.getState().reset();
  useHistoryStore.setState({ history: [] });
  useTeamStore.setState({ number: null, code: "" });
  useTrainingModeStore.setState({ value: false });
});
test("exports a Server-compatible report with original UUID and deterministic timestamps", () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  const store = useReportStateStore;
  expect(store.getState().exportScoutReport()).toBeNull();
  store.getState().scoutMatch(meta);
  store.getState().initializeMatchTimestamp();
  jest.setSystemTime(4000);
  store.getState().addEvent({ type: Event.StartScoring });
  jest.setSystemTime(5000);
  store.getState().addEvent({ type: Event.StopScoring, quantity: 4 });
  const report = store.getState().exportScoutReport()!;
  expect(scoutReportSchema.safeParse(report).success).toBe(true);
  expect(report.uuid).toBe("11111111-1111-4111-8111-111111111111");
  expect(report.startTime).toBe(1000);
  expect(report.events.at(-1)).toEqual([
    4,
    Event.StopScoring,
    MatchEventPosition.None,
    4,
  ]);
  expect(fetch).not.toHaveBeenCalled();
});
test.each([
  [Event.StartScoring, Event.StopScoring],
  [Event.StartFeeding, Event.StopFeeding],
  [Event.StartCamping, Event.StopCamping],
  [Event.StartDefending, Event.StopDefending],
])("undo removes the entire timed action %s/%s", (start, stop) => {
  const store = useReportStateStore;
  store.getState().scoutMatch(meta);
  store.getState().addEvent({ type: Event.Intake });
  store.getState().addEvent({ type: start });
  store.getState().addEvent({ type: stop, quantity: 2 });
  store.getState().undoEvent();
  expect(store.getState().events.map((e) => e.type)).toEqual([Event.Intake]);
  store.getState().undoEvent();
  store.getState().undoEvent();
  expect(store.getState().events).toEqual([]);
});
test("restart clears event and annotation state without changing the selected match", () => {
  const store = useReportStateStore;
  store.getState().scoutMatch(meta);
  store.getState().setNotes("discard");
  store.getState().addEvent({ type: Event.Climb });
  store.getState().restartMatch();
  expect(store.getState().events).toEqual([]);
  expect(store.getState().notes).toBe("");
  expect(store.getState().meta?.matchIdentity).toEqual(meta.matchIdentity);
  expect(store.getState().startTimestamp).toBeUndefined();
});
test("migrates orphaned old starts without mutating input and remains idempotent", () => {
  const old = makeReport({
    appVersion: "26.0.2",
    events: [[3, Event.StartScoring, 0]],
  });
  const migrated = migrateScoutReport(old);
  expect(old.events).toHaveLength(1);
  expect(migrated.events).toEqual([
    [3, Event.StartScoring, 0],
    [3.001, Event.StopScoring, 0, 1],
  ]);
  expect(migrateScoutReport(migrated)).toEqual(migrated);
  expect(migrated.notes).toBe(old.notes);
});
test("version gates preserve current reports and remove orphaned broken-undo starts", () => {
  const current = makeReport({ events: [[1, Event.StartScoring, 0]] });
  expect(migrateScoutReport(current)).toBe(current);
  const old = makeReport({
    appVersion: "26.0.4",
    events: [[1, Event.StartScoring, 0]],
  });
  expect(migrateScoutReport(old).events).toEqual([]);
});
test("history upserts by UUID, persists across rehydration and marks only the selected report uploaded", async () => {
  const first = makeReport();
  const second = makeReport({ uuid: "other" });
  const store = useHistoryStore;
  store.getState().upsertMatch(first, false, meta);
  store.getState().upsertMatch(second, false, meta);
  store.getState().upsertMatch({ ...first, notes: "updated" }, false, meta);
  expect(store.getState().history).toHaveLength(2);
  store.getState().setMatchUploaded(first.uuid);
  expect(
    store.getState().history.find((e) => e.scoutReport.uuid === "other")
      ?.uploaded,
  ).toBe(false);
  const raw = await AsyncStorage.getItem("historyStore2026");
  expect(raw).not.toBeNull();
  store.setState({ history: [] });
  await AsyncStorage.setItem("historyStore2026", raw!);
  await store.persist.rehydrate();
  expect(
    store.getState().history.find((e) => e.scoutReport.uuid === first.uuid),
  ).toMatchObject({ uploaded: true, scoutReport: { notes: "updated" } });
  store.getState().deleteMatch(first.uuid);
  expect(store.getState().history).toHaveLength(1);
});

test("annotation controls serialize every report field without dropping explicit values", () => {
  const store = useReportStateStore;
  store.getState().scoutMatch(meta);
  store.getState().initializeMatchTimestamp(1000);
  const state = store.getState();
  state.setStartPosition(MatchEventPosition.Hub);
  state.setGamePhase(1);
  state.setRobotRole([
    RobotRole.Cycling,
    RobotRole.Scoring,
    RobotRole.Feeding,
    RobotRole.Defending,
    RobotRole.Immobile,
  ]);
  state.setRobotBrokeDescription("Synthetic breakdown");
  state.setFieldTraversal(FieldTraversal.None);
  state.setAccuracy(Accuracy.From60To70);
  state.setAutoClimb(AutoClimb.Succeeded);
  state.setIntakeType(IntakeType.Neither);
  state.setFeederType([
    FeederType.Continuous,
    FeederType.StopToShoot,
    FeederType.Dump,
  ]);
  state.setBeached(Beached.Neither);
  state.setDefenseEffectiveness(DefenseEffectiveness.Average);
  state.setScoresWhileMoving(ScoresWhileMoving.Yes);
  state.setClimbResult(EndgameClimb.L3);
  state.setDriverAbility(DriverAbility.Average);
  state.setNotes("Reviewed synthetic note");
  const report = store.getState().exportScoutReport()!;
  expect(report).toMatchObject({
    notes: "Reviewed synthetic note",
    robotBrokeDescription: "Synthetic breakdown",
    robotRoles: ["CYCLING", "SCORING", "FEEDING", "DEFENDING", "IMMOBILE"],
    mobility: "NONE",
    autoClimb: "SUCCEEDED",
    intakeType: "NEITHER",
    feederTypes: ["CONTINUOUS", "STOP_TO_SHOOT", "DUMP"],
    beached: "NEITHER",
    endgameClimb: "L3",
  });
  expect(scoutReportSchema.safeParse(report).success).toBe(true);
});

test("end-match derives traversal and intake from auto events and freezes the original end time", () => {
  useTeamStore.setState({ number: 4321 });
  const store = useReportStateStore;
  store.getState().scoutMatch(meta);
  store.getState().initializeMatchTimestamp(1000);
  expect(store.getState().getAutoTraversalTypes()).toEqual({
    trench: false,
    bump: false,
  });
  store.getState().addEvent({
    type: Event.Cross,
    position: MatchEventPosition.LeftTrench,
    timestamp: 2000,
  });
  store.getState().addEvent({
    type: Event.Cross,
    position: MatchEventPosition.RightBump,
    timestamp: 3000,
  });
  store.getState().addEvent({
    type: Event.Intake,
    position: MatchEventPosition.Outpost,
    timestamp: 4000,
  });
  store.getState().addEvent({ type: Event.Climb, timestamp: 5000 });
  store.getState().addEvent({ type: Event.Climb, timestamp: 25000 });
  expect(store.getState().hasAutoTraversalEvent()).toBe(true);
  expect(store.getState().hasAutoClimbEvent()).toBe(true);
  expect(store.getState().hasEndgameClimbEvent()).toBe(true);
  expect(store.getState().hasEventOfType(Event.Intake)).toBe(true);
  store.getState().endMatchAt(160000);
  store.getState().endMatch();
  expect(store.getState().meta?.collection?.endTime).toBe(160000);
  expect(store.getState().getAutoTraversalTypes()).toEqual({
    trench: true,
    bump: true,
  });
  store.getState().stopClimbing();
  expect(store.getState().hasEventOfType(Event.Climb)).toBe(false);
});

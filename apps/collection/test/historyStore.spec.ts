import AsyncStorage from "@react-native-async-storage/async-storage";
import { useHistoryStore } from "../lib/storage/historyStore";
import { migrateScoutReport } from "../lib/storage/scoutReportMigrations";
import {
  scoutReportSchema,
  type ScoutReport as Legacy,
} from "../lib/collection/ScoutReport2026";
import { MatchEventType } from "../lib/collection/MatchEventType";
import { meta, startReport } from "./fixtures";
const legacy: Legacy = scoutReportSchema.parse({
  uuid: "legacy",
  tournamentKey: "2026test",
  matchType: "QUALIFICATION",
  matchNumber: 1,
  startTime: 1000,
  teamNumber: 254,
  scouterUuid: "scout",
  notes: "",
  robotBrokeDescription: null,
  robotRoles: [],
  mobility: "NONE",
  disrupts: false,
  accuracy: null,
  autoClimb: "NOT_ATTEMPTED",
  intakeType: "NEITHER",
  feederTypes: [],
  beached: "NEITHER",
  defenseEffectiveness: 3,
  scoresWhileMoving: false,
  endgameClimb: "NOT_ATTEMPTED",
  driverAbility: 3,
  events: [],
});
beforeEach(() => useHistoryStore.setState({ history: [] }));
test("history upserts a UUID exactly once, preserves other reports, and marks only the selected report uploaded", () => {
  const first = startReport(),
    second = { ...first, uuid: "second" };
  const store = () => useHistoryStore.getState();
  store().upsertMatch(first, false, meta);
  store().upsertMatch(second, false, meta);
  store().upsertMatch(first, true, meta);
  expect(store().history.map((e) => e.scoutReport.uuid)).toEqual([
    first.uuid,
    "second",
  ]);
  store().setMatchUploaded("second");
  expect(store().history.every((e) => e.uploaded)).toBe(true);
  store().deleteMatch(first.uuid);
  expect(store().history).toHaveLength(1);
});
it.each([
  undefined,
  "25",
  "26",
  "26.0.3.1",
  "26.0.3",
  "26.0.5",
  "26.1.0",
  "26.1.0.1",
  "27.0.0",
])(
  "legacy version %s migrates scoring/feeding pairs without dropping unrelated events",
  (appVersion) => {
    const events: Legacy["events"] = [
      [1, MatchEventType.StartScoring, 1],
      [2, MatchEventType.StopScoring, 1, 5],
      [3, MatchEventType.StartScoring, 1],
      [4, MatchEventType.StartFeeding, 1],
      [5, MatchEventType.StopDefending, 1],
      [6, MatchEventType.StartDefending, 1],
      [7, MatchEventType.StopDefending, 1],
      [8, MatchEventType.StartCamping, 1],
      [9, MatchEventType.StopCamping, 1],
      [10, 99, 1],
    ];
    const migrated = migrateScoutReport({ ...legacy, appVersion, events });
    expect(migrated.uuid).toBe("legacy");
    expect(migrated.events).toContainEqual([10, 99, 1]);
    if (appVersion === undefined || appVersion === "25")
      expect(migrated.events).toContainEqual([
        3.001,
        MatchEventType.StopScoring,
        1,
        1,
      ]);
  },
);
test("history hydration upgrades legacy records once and leaves Charged Up records intact", async () => {
  const current = startReport();
  await AsyncStorage.setItem(
    "historyStore",
    JSON.stringify({
      state: {
        history: [
          { scoutReport: legacy, uploaded: false, meta },
          { scoutReport: current, uploaded: true, meta },
        ],
      },
      version: 0,
    }),
  );
  await useHistoryStore.persist.rehydrate();
  expect(useHistoryStore.getState().history[1].scoutReport).toEqual(current);
  expect(useHistoryStore.getState().history[0].scoutReport.uuid).toBe("legacy");
  await useHistoryStore.persist.rehydrate();
  expect(useHistoryStore.getState().history).toHaveLength(2);
  const read = jest
    .spyOn(AsyncStorage, "getItem")
    .mockRejectedValue(new Error("Unavailable storage"));
  await useHistoryStore.persist.rehydrate();
  expect(useHistoryStore.getState().history).toHaveLength(2);
  read.mockRestore();
});

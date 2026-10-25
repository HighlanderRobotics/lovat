import assert from "node:assert/strict";
import { test } from "node:test";
import { seasonHistoryStorage } from "../lib/storage/seasonHistoryStorage.ts";
import { scoutReportSchema } from "../lib/collection/ScoutReport.ts";

const report2026 = {
  uuid: "report-2026",
  tournamentKey: "2026joh",
  matchType: "QUALIFICATION",
  matchNumber: 19,
  startTime: 0,
  teamNumber: 118,
  notes: "",
  robotBrokeDescription: null,
  robotRoles: ["CYCLING", "SCORING"],
  mobility: "BOTH",
  disrupts: false,
  accuracy: 4,
  autoClimb: "NOT_ATTEMPTED",
  intakeType: "GROUND",
  feederTypes: [],
  beached: "NEITHER",
  defenseEffectiveness: 2,
  scoresWhileMoving: true,
  endgameClimb: "NOT_ATTEMPTED",
  driverAbility: 5,
  scouterUuid: "scout",
  events: [[0, 2, 3]],
};
const envelope = (history) =>
  JSON.stringify({ state: { history }, version: 0 });
const setup = (initial) => {
  const data = new Map(Object.entries(initial));
  const raw = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  const storage = seasonHistoryStorage(
    raw,
    (entry) => scoutReportSchema.safeParse(entry?.scoutReport).success,
  );
  return { data, storage };
};

test("imports valid 2026 history without overwriting Charged Up data", async () => {
  const entry = { scoutReport: report2026, uploaded: false };
  const legacy = envelope([
    entry,
    { scoutReport: { gameYear: 2023, events: [] } },
    null,
  ]);
  const { storage, data } = setup({ historyStore: legacy });
  const imported = await storage.getItem("historyStore2026");
  assert.deepEqual(JSON.parse(imported).state.history, [entry]);
  assert.equal(data.get("historyStore"), legacy);
  await storage.setItem("historyStore2026", imported);
  await storage.removeItem("historyStore2026");
  assert.equal(data.get("historyStore"), legacy);
});

test("existing season history wins even when it is empty", async () => {
  const current = envelope([]);
  const { storage } = setup({
    historyStore2026: current,
    historyStore: envelope([{ scoutReport: report2026 }]),
  });
  assert.equal(await storage.getItem("historyStore2026"), current);
});

test("missing and malformed legacy storage cannot crash startup", async () => {
  for (const legacy of [
    undefined,
    "invalid JSON",
    "null",
    envelope(null),
    JSON.stringify({ state: {} }),
  ]) {
    const { storage } = setup(
      legacy === undefined ? {} : { historyStore: legacy },
    );
    assert.equal(await storage.getItem("historyStore2026"), null);
  }
});

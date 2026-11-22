import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWatchContext } from "../lib/watch/watchContext.ts";

const state = {
  hydrated: true,
  onboardingComplete: true,
  trainingMode: false,
  team: { code: "test-code", number: 8033 },
  scouter: { uuid: "me", name: "Scout", sourceTeamNumber: 8033 },
  tournament: { key: "2026test", name: "Test event" },
  apiURL: "https://api.example.com",
  history: [],
};

test("waits for hydration instead of incorrectly signing out the watch", () => {
  assert.equal(buildWatchContext({ ...state, hydrated: false }), null);
});

for (const changes of [
  { onboardingComplete: false },
  { trainingMode: true },
  { team: { code: "", number: 8033 } },
  { scouter: null },
  { tournament: null },
  { scouter: { ...state.scouter, sourceTeamNumber: 254 } },
]) {
  test(`clears credentials and assignments for ${JSON.stringify(changes)}`, () => {
    assert.deepEqual(buildWatchContext({ ...state, ...changes }), {
      signedIn: false,
    });
  });
}

test("shares the active identity and only that scouter's completed event matches", () => {
  const entry = (scouterUUID, tournamentKey, matchType, matchNumber) => ({
    meta: {
      scouterUUID,
      matchIdentity: { tournamentKey, matchType, matchNumber },
    },
  });
  const context = buildWatchContext({
    ...state,
    history: [
      entry("me", "2026test", "QUALIFIER", 4),
      entry("me", "2026test", "PLAYOFF", 1),
      entry("me", "2026test", "PRACTICE", 2),
      entry("other", "2026test", "QUALIFIER", 6),
      entry("me", "other", "QUALIFIER", 9),
    ],
  });
  assert.deepEqual(context, {
    signedIn: true,
    apiURL: state.apiURL,
    teamCode: state.team.code,
    teamNumber: 8033,
    scouterUUID: "me",
    scouterName: "Scout",
    tournamentKey: "2026test",
    tournamentName: "Test event",
    completedMatches: ["0-4", "1-1"],
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadScouterServices,
  resolveStartupRoute,
  shouldFetchScouterServices,
  validatePersistedScouter,
} from "../lib/collection/startup.ts";

const scouter = { uuid: "scouter-1" };
const tournament = { key: "2026test" };

function serviceFetches(teamScouters = [scouter]) {
  const calls = [];
  return {
    calls,
    fetchTeamScouters: async () => {
      calls.push("scouters");
    },
    fetchTournaments: async () => {
      calls.push("tournaments");
    },
    fetchScouterSchedule: async () => {
      calls.push("schedule");
    },
    fetchMatchSchedule: async () => {
      calls.push("matchSchedule");
    },
    getTeamScouters: () => teamScouters,
  };
}

test("does not load scouter services during a fresh install", () => {
  assert.equal(shouldFetchScouterServices(null), false);
  assert.equal(shouldFetchScouterServices(undefined), false);
});

test("loads scouter services for a persisted scouter", () => {
  assert.equal(shouldFetchScouterServices(scouter), true);
});

test("startup with a null scouter does not fetch tournaments", async () => {
  const fetches = serviceFetches();
  const result = await loadScouterServices(null, fetches);

  assert.deepEqual(fetches.calls, []);
  assert.equal(result.invalidScouter, false);
  assert.equal(result.error, null);
});

test("normal startup with a valid persisted scouter loads tournaments", async () => {
  const fetches = serviceFetches();
  const result = await loadScouterServices(scouter, fetches);

  assert.deepEqual(fetches.calls, [
    "scouters",
    "tournaments",
    "schedule",
    "matchSchedule",
  ]);
  assert.equal(result.invalidScouter, false);
  assert.equal(result.error, null);
});

test("deleted persisted scouter is cleared without fetching tournaments", async () => {
  const fetches = serviceFetches([]);
  const result = await loadScouterServices(scouter, fetches);

  assert.deepEqual(fetches.calls, ["scouters"]);
  assert.equal(result.invalidScouter, true);
  assert.equal(result.error, null);
});

test("team scouter fetch failure still loads cached tournament data", async () => {
  const fetches = serviceFetches();
  fetches.fetchTeamScouters = async () => {
    fetches.calls.push("scouters");
    throw new Error("offline");
  };

  const result = await loadScouterServices(scouter, fetches);

  assert.deepEqual(fetches.calls, [
    "scouters",
    "tournaments",
    "schedule",
    "matchSchedule",
  ]);
  assert.equal(result.invalidScouter, false);
  assert.match(String(result.error), /offline/);
});

test("startup reports a tournament fetch failure", async () => {
  const fetches = serviceFetches();
  fetches.fetchTournaments = async () => {
    fetches.calls.push("tournaments");
    throw new Error("tournaments unavailable");
  };

  const result = await loadScouterServices(scouter, fetches);

  assert.match(String(result.error), /tournaments unavailable/);
});

test("reports a missing scouter separately from an invalid one", () => {
  assert.equal(validatePersistedScouter(null, null), "missing");
  assert.equal(validatePersistedScouter(null, []), "missing");
});

test("accepts a persisted scouter that is still on the team", () => {
  assert.equal(
    validatePersistedScouter(scouter, [scouter, { uuid: "scouter-2" }]),
    "valid",
  );
});

test("rejects a deleted or archived persisted scouter", () => {
  assert.equal(validatePersistedScouter(scouter, []), "invalid");
  assert.equal(
    validatePersistedScouter(scouter, [{ uuid: "scouter-2" }]),
    "invalid",
  );
});

test("leaves a scouter unverified when the team list is unavailable", () => {
  assert.equal(validatePersistedScouter(scouter, null), "unverified");
});

test("sends a fresh install to the welcome screen", () => {
  assert.equal(
    resolveStartupRoute({
      onboardingComplete: false,
      teamCode: "",
      scouter: null,
      tournament: null,
    }),
    "/onboarding",
  );
});

test("sends a missing persisted scouter to scouter selection", () => {
  assert.equal(
    resolveStartupRoute({
      onboardingComplete: true,
      teamCode: "8033",
      scouter: null,
      tournament,
    }),
    "/onboarding/name",
  );
});

test("sends a valid persisted scouter without a tournament to selection", () => {
  assert.equal(
    resolveStartupRoute({
      onboardingComplete: true,
      teamCode: "8033",
      scouter,
      tournament: null,
    }),
    "/onboarding/tournaments",
  );
});

test("keeps a valid persisted scouter with a tournament on home", () => {
  assert.equal(
    resolveStartupRoute({
      onboardingComplete: true,
      teamCode: "8033",
      scouter,
      tournament,
    }),
    "/home",
  );
});

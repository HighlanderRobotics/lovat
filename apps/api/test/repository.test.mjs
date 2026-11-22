import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepository } from "../dist/repository.js";
import { scope } from "./fixtures.mjs";
test("repository applies source, reliability, training and season restrictions", async () => {
  const calls = [];
  const repository = createRepository({
    scoutReport: {
      findMany: async (query) => {
        calls.push(query);
        return [];
      },
    },
    event: {
      findMany: async () => {
        throw new Error("Scalar metric must not load events");
      },
    },
  });
  await repository.loadReports(
    scope,
    { teams: [8033], season: 2026 },
    new Set(["driverAbility"]),
  );
  const where = calls[0].where;
  assert.deepEqual(where.scouter.sourceTeamNumber, { in: [8033] });
  assert.deepEqual(where.teamMatchData.tournamentKey, { notIn: [] });
  assert.deepEqual(where.reliability.in, ["VERIFIED", "UNVERIFIED"]);
  assert.equal(where.training, false);
  assert.equal(where.teamMatchData.matchType.not, "PRACTICE");
  assert.equal(where.teamMatchData.tournament.seasonYear, 2026);
  assert.equal(calls[0].take, 5001);
});
test("repository refuses oversized datasets rather than silently truncating", async () => {
  const repository = createRepository({
    scoutReport: { findMany: async () => Array(5001).fill({ uuid: "x" }) },
  });
  await assert.rejects(
    repository.loadReports(scope, { teams: [8033], season: 2026 }, new Set()),
    { code: "ANALYSIS_TOO_LARGE" },
  );
});

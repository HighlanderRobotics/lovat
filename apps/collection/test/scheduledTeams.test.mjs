import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduledTeamsForAlliance } from "../lib/collection/scheduledTeams.ts";

const matchTeams = [
  { number: 8033, alliance: "red" },
  { number: 254, alliance: "blue" },
  { number: 118, alliance: "red" },
  { number: 1678, alliance: "blue" },
  { number: 971, alliance: "red" },
  { number: 604, alliance: "blue" },
];

test("returns the red alliance teams in schedule order", () => {
  assert.deepEqual(
    scheduledTeamsForAlliance(matchTeams, "red"),
    [8033, 118, 971],
  );
});

test("returns the blue alliance teams in schedule order", () => {
  assert.deepEqual(
    scheduledTeamsForAlliance(matchTeams, "blue"),
    [254, 1678, 604],
  );
});

test("ignores teams whose alliance is unknown", () => {
  const teams = [
    { number: 8033, alliance: "red" },
    { number: 1234, alliance: null },
    { number: 118, alliance: "red" },
    { number: 971, alliance: "red" },
  ];

  assert.deepEqual(scheduledTeamsForAlliance(teams, "red"), [8033, 118, 971]);
});

test("returns no teams when no schedule is cached", () => {
  assert.deepEqual(scheduledTeamsForAlliance(undefined, "red"), []);
});

test("returns no teams when the match has no alliance data", () => {
  const teams = [
    { number: 8033, alliance: null },
    { number: 254, alliance: null },
  ];

  assert.deepEqual(scheduledTeamsForAlliance(teams, "red"), []);
});

test("returns no teams when the selected alliance is empty", () => {
  const teams = [{ number: 8033, alliance: "red" }];

  assert.deepEqual(scheduledTeamsForAlliance(teams, "blue"), []);
});

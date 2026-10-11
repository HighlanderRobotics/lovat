import { expect, test } from "bun:test";
import { inferTournamentGaps } from "../src/gaps";

type Timing = Parameters<typeof inferTournamentGaps>[2][number];
const eventKey = "2026fixture";
const timezone = "America/Los_Angeles";

function match(number: number, time: string | null): Timing {
  return {
    key: `${eventKey}_qm${number}`,
    competitionLevel: "QUALIFICATION",
    setNumber: 1,
    matchNumber: number,
    scheduledTime: time ? new Date(time) : null,
    actualTime: null,
    predictedTime: null,
    postResultTime: null,
  };
}

test("identifies scheduled lunch in local time and estimates the preceding match duration", () => {
  const after = match(1, "2026-03-06T19:00:00Z");
  const before = match(2, "2026-03-06T20:00:00Z");
  const gaps = inferTournamentGaps(eventKey, timezone, [before, after]);

  expect(gaps).toHaveLength(1);
  expect(gaps[0]).toMatchObject({
    type: "LUNCH",
    timingSource: "SCHEDULED",
    afterMatchKey: after.key,
    beforeMatchKey: before.key,
    startTime: new Date("2026-03-06T19:03:00Z"),
    endTime: before.scheduledTime,
  });
});

test("overnight marks EOD/new-day boundaries across daylight saving time", () => {
  const gaps = inferTournamentGaps(eventKey, timezone, [
    match(1, "2026-03-08T01:00:00Z"),
    match(2, "2026-03-08T16:00:00Z"),
  ]);

  expect(gaps[0]?.type).toBe("OVERNIGHT");
});

test("identifies playoff transition gaps at the shorter threshold", () => {
  const after = match(1, "2026-03-06T19:00:00Z");
  const before = {
    ...match(1, "2026-03-06T19:20:00Z"),
    key: `${eventKey}_sf1m1`,
    competitionLevel: "SEMIFINAL" as const,
  };

  expect(
    inferTournamentGaps(eventKey, timezone, [before, after])[0]?.type,
  ).toBe("PLAYOFF_TRANSITION");
});

test("actual unplanned interruptions are delays even around lunchtime", () => {
  const after = match(1, "2026-03-06T19:00:00Z");
  const before = match(2, "2026-03-06T19:08:00Z");
  after.actualTime = new Date("2026-03-06T19:00:00Z");
  after.postResultTime = new Date("2026-03-06T19:04:00Z");
  before.actualTime = new Date("2026-03-06T19:50:00Z");
  const gaps = inferTournamentGaps(eventKey, timezone, [after, before]);

  expect(gaps[0]).toMatchObject({
    type: "DELAY",
    timingSource: "ACTUAL",
    startTime: after.postResultTime,
    endTime: before.actualTime,
  });
});

test("uses actual timing to remove a planned gap that did not occur", () => {
  const after = match(1, "2026-03-06T19:00:00Z");
  const before = match(2, "2026-03-06T20:00:00Z");
  after.actualTime = new Date("2026-03-06T19:00:00Z");
  before.actualTime = new Date("2026-03-06T19:10:00Z");

  expect(inferTournamentGaps(eventKey, timezone, [after, before])).toEqual([]);
});

test("retains unknown breaks without guessing local classifications", () => {
  const matches = [
    match(1, "2026-03-06T19:00:00Z"),
    match(2, "2026-03-06T20:00:00Z"),
  ];

  expect(inferTournamentGaps(eventKey, null, matches)[0]?.type).toBe("BREAK");
  expect(inferTournamentGaps(eventKey, "invalid", matches)[0]?.type).toBe(
    "BREAK",
  );
  expect(
    inferTournamentGaps(eventKey, timezone, [
      match(1, "2026-03-06T16:00:00Z"),
      match(2, "2026-03-06T17:00:00Z"),
    ])[0]?.type,
  ).toBe("BREAK");
});

test("does not bridge missing matches, mix clocks or invent a trailing EOD", () => {
  const after = match(1, "2026-03-06T19:00:00Z");
  const before = match(3, "2026-03-06T20:00:00Z");

  expect(
    inferTournamentGaps(eventKey, timezone, [after, match(2, null), before]),
  ).toEqual([]);
  expect(inferTournamentGaps(eventKey, timezone, [after, before])).toEqual([]);
  expect(inferTournamentGaps(eventKey, timezone, [after])).toEqual([]);
  after.scheduledTime = null;
  after.actualTime = new Date("2026-03-06T19:00:00Z");

  expect(
    inferTournamentGaps(eventKey, timezone, [
      after,
      { ...before, key: `${eventKey}_qm2`, matchNumber: 2 },
    ]),
  ).toEqual([]);
});

test("uses predicted times only when comparable actual and scheduled pairs are absent", () => {
  const after = match(1, null);
  const before = match(2, null);
  after.predictedTime = new Date("2026-03-06T19:00:00Z");
  before.predictedTime = new Date("2026-03-06T20:00:00Z");

  expect(
    inferTournamentGaps(eventKey, timezone, [after, before])[0]?.timingSource,
  ).toBe("PREDICTED");
  before.predictedTime = new Date("2026-03-06T18:00:00Z");

  expect(inferTournamentGaps(eventKey, timezone, [after, before])).toEqual([]);
});

test("historical bracket gaps connect adjacent games rather than whole series", () => {
  const bracket = (set: number, number: number, time: string): Timing => ({
    ...match(number, time),
    key: `${eventKey}_qf${set}m${number}`,
    competitionLevel: "QUARTERFINAL",
    setNumber: set,
  });
  const matches = [
    bracket(1, 1, "2026-03-06T16:00:00Z"),
    bracket(1, 2, "2026-03-06T17:00:00Z"),
    bracket(2, 1, "2026-03-06T16:08:00Z"),
    bracket(2, 2, "2026-03-06T17:08:00Z"),
  ];
  const gaps = inferTournamentGaps(eventKey, timezone, matches);

  expect(gaps).toHaveLength(1);
  expect(gaps[0]).toMatchObject({
    afterMatchKey: `${eventKey}_qf2m1`,
    beforeMatchKey: `${eventKey}_qf1m2`,
    startTime: new Date("2026-03-06T16:11:00Z"),
    endTime: new Date("2026-03-06T17:00:00Z"),
  });
});

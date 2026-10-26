import { test, expect } from "bun:test";
import { apportion, fuseMatch } from "../src/ocr/fusion";
const slots = [1, 2, 3, 4, 5, 6].map((teamNumber) => ({
  teamNumber,
  alliance: teamNumber <= 3 ? "RED" : "BLUE",
}));
function report(
  teamNumber: number,
  quantity: number,
  source = 8033,
  id = `r-${teamNumber}-${source}`,
  start = 5,
  end = 10,
) {
  return {
    uuid: id,
    teamNumber,
    alliance: teamNumber <= 3 ? "RED" : "BLUE",
    sourceTeamNumber: source,
    events: [
      {
        eventUuid: id + "-a",
        time: start,
        action: "START_SCORING",
        quantity: 0,
      },
      { eventUuid: id + "-b", time: end, action: "STOP_SCORING", quantity },
    ],
  };
}
function input() {
  return {
    matchKey: "2026cacg_qm1",
    slots,
    reports: [report(1, 10), report(2, 30), report(4, 20)],
    ocr: {
      matchKey: "2026cacg_qm1",
      status: "PARTIAL",
      observations: [
        {
          time: 0,
          red: 0,
          blue: 0,
          confidence: 95,
          redPoints: 0,
          bluePoints: 0,
          pointsConfidence: 95,
        },
        {
          time: 12,
          red: 20,
          blue: 10,
          confidence: 95,
          redPoints: 25,
          bluePoints: 10,
          pointsConfidence: 95,
        },
      ],
    },
  };
}
test("conserves real scoreboard points and leaves non-fuel points unattributed", () => {
  const result = fuseMatch(input(), [8033]);
  const [red, blue] = result.alliances;
  expect(red!.teams.map((t) => t.estimatedPoints)).toEqual([5, 15, 0]);
  expect(red!.unattributedNonFuelPoints).toBe(5);
  expect(red!.scoreboardPoints).toBe(25);
  expect(blue!.teams.map((t) => t.estimatedPoints)).toEqual([10, 0, 0]);
  for (const a of result.alliances)
    expect(
      a.teams.reduce((s, t) => s + t.estimatedPoints, 0) + a.unattributedPoints,
    ).toBe(a.scoreboardPoints);
});
test("is byte-identical after input reports, events, roster, and observations are shuffled", () => {
  const a = input(),
    b = structuredClone(a);
  b.slots.reverse();
  b.reports.reverse();
  for (const r of b.reports) r.events.reverse();
  b.ocr.observations.reverse();
  expect(JSON.stringify(fuseMatch(a, [8033, 1967]))).toBe(
    JSON.stringify(fuseMatch(b, [1967, 8033])),
  );
});
test("uses deterministic largest-remainder ties and preserves arbitrary integer totals", () => {
  expect(
    apportion(1, [
      { teamNumber: 2, weight: 1 },
      { teamNumber: 1, weight: 1 },
    ]).teams,
  ).toEqual([
    { teamNumber: 1, points: 1 },
    { teamNumber: 2, points: 0 },
  ]);
  for (let total = 0; total < 200; total++) {
    const r = apportion(total, [
      { teamNumber: 1, weight: 3 },
      { teamNumber: 2, weight: 7 },
      { teamNumber: 3, weight: 11 },
    ]);
    expect(r.teams.reduce((s, t) => s + t.points, 0)).toBe(total);
  }
  expect(apportion(9, [{ teamNumber: 1, weight: 0 }]).unattributed).toBe(9);
});
test("averages independent source teams instead of summing repeated reports", () => {
  const a = input();
  a.reports = [report(1, 10, 8033), report(1, 30, 1967), report(2, 20, 8033)];
  const b = structuredClone(a);
  b.reports.push({
    ...report(1, 30, 1967, "duplicate"),
    events: report(1, 30, 1967, "duplicate").events,
  });
  const ra = fuseMatch(a, [1967, 8033]).alliances[0]!,
    rb = fuseMatch(b, [1967, 8033]).alliances[0]!;
  expect(ra.teams.map((t) => t.estimatedPoints)).toEqual([10, 10, 0]);
  expect(rb).toEqual(ra);
});
test("ignores feeding, excludes blocked reports, and does not invent missing attribution", () => {
  const a = input();
  a.reports[0]!.events = a.reports[0]!.events.map((e) => ({
    ...e,
    action: e.action.replace("SCORING", "FEEDING"),
  }));
  const r = fuseMatch(a, [8033]).alliances[0]!;
  expect(r.teams.map((t) => t.estimatedPoints)).toEqual([0, 20, 0]);
  const b = input();
  b.reports = [];
  const missing = fuseMatch(b, [8033]).alliances[0]!;
  expect(missing.unattributedFuel).toBe(20);
  expect(missing.unattributedPoints).toBe(25);
  const c = input();
  (c.reports[0] as any).analysisExcluded = true;
  expect(fuseMatch(c, [8033]).alliances[0]!.teams[0]!.estimatedPoints).toBe(0);
});
test("requires scoped, matching identities and actual total-score OCR", () => {
  expect(() => fuseMatch(input(), [])).toThrow("scope");
  const bad = input();
  bad.ocr.matchKey = "wrong";
  expect(() => fuseMatch(bad, [8033])).toThrow("identity");
  const missing = input();
  for (const s of missing.ocr.observations) {
    delete (s as any).redPoints;
    delete (s as any).bluePoints;
  }
  expect(() => fuseMatch(missing, [8033])).toThrow("Total-score");
  const mismatched = input();
  mismatched.reports[0]!.alliance = "BLUE";
  expect(() => fuseMatch(mismatched, [8033])).toThrow("alliance");
});
test("declines corrections and contradictory fuel/point totals", () => {
  const a = input();
  a.ocr.observations[0]!.red = 21;
  expect(() => fuseMatch(a, [8033])).toThrow("correction");
  const b = input();
  b.ocr.observations[1]!.redPoints = 19;
  expect(() => fuseMatch(b, [8033])).toThrow("contradict");
  const c = input();
  c.ocr.observations[0]!.redPoints = 30;
  expect(() => fuseMatch(c, [8033])).toThrow("point correction");
});
test("cuts off attribution at the last total-score reading instead of extrapolating", () => {
  const a = input();
  a.ocr.observations.push({
    time: 14,
    red: 25,
    blue: 11,
    confidence: 95,
  } as any);
  const r = fuseMatch(a, [8033]);
  expect(r.scoreboardThrough).toBe(12);
  expect(r.alliances[0]!.observedFuel).toBe(20);
});
test("keeps simultaneous shots ambiguous and ignores unmatched stop markers", () => {
  const a = input();
  a.reports = [report(1, 10), report(2, 10)];
  a.reports[0]!.events.shift();
  const r = fuseMatch(a, [8033]);
  expect(r.diagnostics.unmatchedStops).toBe(1);
  expect(r.alliances[0]!.teams.map((t) => t.estimatedPoints)).toEqual([
    0, 20, 0,
  ]);
  const b = input();
  b.reports = [report(1, 10), report(2, 10)];
  expect(
    fuseMatch(b, [8033]).alliances[0]!.intervals[1]!.supportingTeams,
  ).toEqual([1, 2]);
});
test("one-point intervals cannot repeatedly give rounding ties to one robot", () => {
  const a = input();
  a.reports = [report(1, 10), report(2, 10)];
  a.ocr.observations = [
    {
      time: 8,
      red: 1,
      blue: 0,
      confidence: 95,
      redPoints: 1,
      bluePoints: 0,
      pointsConfidence: 95,
    },
    {
      time: 9,
      red: 2,
      blue: 0,
      confidence: 95,
      redPoints: 2,
      bluePoints: 0,
      pointsConfidence: 95,
    },
  ];
  expect(
    fuseMatch(a, [8033]).alliances[0]!.teams.map((t) => t.estimatedPoints),
  ).toEqual([1, 1, 0]);
});
test("does not mutate its input or expose mutable global policy", () => {
  const a = input(),
    copy = JSON.stringify(a);
  const first = fuseMatch(a, [8033]);
  (first.policy as { earlyMs: number }).earlyMs = 999;
  expect(fuseMatch(a, [8033]).policy.earlyMs).toBe(1000);
  expect(JSON.stringify(a)).toBe(copy);
});

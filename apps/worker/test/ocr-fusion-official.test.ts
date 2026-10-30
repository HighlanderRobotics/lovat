import { test, expect } from "bun:test";
import { fuseMatch } from "../src/ocr/fusion";
import {
  contributionTables,
  contributionCsv,
} from "../src/ocr/contribution-export";
import { fixture } from "./fixtures/official-fusion";
test("official cumulative auto budget separates delayed auto updates from teleop", () => {
  const r = fuseMatch(fixture(), [8033]);
  expect(r.algorithm).toBe("scoreboard-constrained-fusion-v5-tba-consensus");
  const red = r.alliances[0] as any;
  expect(red.teams.find((t: any) => t.teamNumber === 1).autoFuelPoints).toBe(4);
  expect(red.teams.find((t: any) => t.teamNumber === 2).autoFuelPoints).toBe(0);
  expect(red.phases.map((p: any) => p.fuelPoints)).toEqual([4, 6]);
  expect(
    red.intervals
      .find((i: any) => i.to === 24)
      .phases.map((p: any) => p.fuelDelta),
  ).toEqual([4, 2]);
});
test("awarded foul points stay on the receiving alliance instead of a robot", () => {
  const red = fuseMatch(fixture(), [8033]).alliances[0] as any;
  expect(red.foulPoints).toBe(5);
  expect(
    red.teams.reduce((n: number, t: any) => n + t.estimatedPoints, 0) +
      red.unattributedPoints,
  ).toBe(10);
  expect(
    red.teams.reduce((n: number, t: any) => n + t.estimatedPoints, 0) +
      red.unattributedPoints +
      red.foulPoints,
  ).toBe(15);
});
test("tower awards follow TBA station order rather than sorted team number", () => {
  const a = fixture(),
    b = a.tba.score_breakdown.red;
  b.autoTowerRobot1 = "Level1";
  b.autoTowerPoints = 15;
  b.totalAutoPoints += 15;
  b.endGameTowerRobot2 = "Level3";
  b.endGameTowerPoints = 30;
  b.totalTeleopPoints += 30;
  b.totalTowerPoints = 45;
  b.totalPoints += 45;
  a.tba.alliances.red.score += 45;
  const red = fuseMatch(a, [8033]).alliances[0] as any;
  expect(red.teams.find((t: any) => t.teamNumber === 3).autoTowerPoints).toBe(
    15,
  );
  expect(
    red.teams.find((t: any) => t.teamNumber === 1).endgameTowerPoints,
  ).toBe(30);
  expect(red.phases.map((p: any) => p.officialPoints)).toEqual([19, 36]);
});
test("endgame fuel is included in teleop and is not added again", () => {
  const red = fuseMatch(fixture(), [8033]).alliances[0] as any;
  expect(red.endgameFuelIncludedInTeleop.points).toBe(6);
  expect(red.officialPoints).toBe(15);
  expect(red.phases[1].officialPoints).toBe(6);
});
test("late report/score windows can attribute a bounded post-buzzer TBA remainder", () => {
  const a = fixture();
  a.reports[1]!.events[0]!.time = 161;
  a.reports[1]!.events[1]!.time = 165;
  a.ocr.observations = [
    { time: 0, red: 0, blue: 0, confidence: 95 },
    { time: 20, red: 4, blue: 0, confidence: 95 },
    { time: 163, red: 6, blue: 0, confidence: 95 },
  ];
  const red = fuseMatch(a, [8033]).alliances[0] as any;
  expect(red.unseenOfficialFuel).toBe(4);
  const tail = red.intervals.at(-1);
  expect(tail.source).toBe("TBA_REMAINDER");
  expect(tail.from).toBe(163);
  expect(tail.to).toBe(167);
  expect(tail.allocation.find((x: any) => x.teamNumber === 2).fuelMicros).toBe(
    4e6,
  );
});
test("a long unseen tail remains unattributed and unknown tower results are not invented", () => {
  const a = fixture();
  a.ocr.observations = a.ocr.observations.filter((s) => s.time <= 24);
  const red = fuseMatch(a, [8033]).alliances[0] as any;
  expect(red.phases[1].unattributedFuel).toBe(5);
  const tail = red.intervals.find((i: any) => i.source === "TBA_REMAINDER");
  expect(tail.unattributedFuel).toBe(4);
  expect(tail.allocation.every((r: any) => r.fuelMicros === 0)).toBe(true);
  const b = fixture();
  b.tba.score_breakdown.red.endGameTowerRobot1 = "Unknown";
  b.tba.score_breakdown.red.endGameTowerPoints = 10;
  b.tba.score_breakdown.red.totalTowerPoints = 10;
  b.tba.score_breakdown.red.totalTeleopPoints += 10;
  b.tba.score_breakdown.red.totalPoints += 10;
  b.tba.alliances.red.score += 10;
  const r = fuseMatch(b, [8033]).alliances[0] as any;
  expect(r.phases[1].unattributedTowerPoints).toBe(10);
});
test("rejects inconsistent identities, official totals, and OCR overshooting TBA", () => {
  const a = fixture();
  a.tba.key = "2026test_qm2";
  expect(() => fuseMatch(a, [8033])).toThrow("identity");
  const b = fixture();
  b.tba.alliances.red.team_keys[0] = "frc999";
  expect(() => fuseMatch(b, [8033])).toThrow("mapping");
  const c = fixture();
  c.tba.score_breakdown.red.hubScore.totalCount++;
  expect(() => fuseMatch(c, [8033])).toThrow("phase totals");
  const d = fixture();
  d.ocr.observations.at(-1)!.red = 11;
  expect(() => fuseMatch(d, [8033])).toThrow("exceeds");
  const e = fixture();
  e.tba.score_breakdown.red.foulPoints = 30;
  expect(() => fuseMatch(e, [8033])).toThrow("reconcile");
});
test("official fusion is deterministic after all non-positional input arrays are reversed", () => {
  const a = fixture(),
    b = structuredClone(a);
  b.slots.reverse();
  b.reports.reverse();
  b.reports.forEach((r) => r.events.reverse());
  b.ocr.observations.reverse();
  expect(JSON.stringify(fuseMatch(a, [8033, 1967]))).toBe(
    JSON.stringify(fuseMatch(b, [1967, 8033])),
  );
});
test("missing auto counter evidence cannot be assigned to teleop", () => {
  const a = fixture();
  a.ocr.observations = [
    { time: 0, red: 0, blue: 0, confidence: 95 },
    { time: 163, red: 2, blue: 0, confidence: 95 },
  ];
  const red = fuseMatch(a, [8033]).alliances[0] as any;
  expect(red.unseenAutoFuel).toBe(2);
  expect(red.phases[0].unattributedFuel).toBe(2);
  expect(red.phases[1].unattributedFuel).toBe(6);
});

test("offseason letter-suffix teams require an explicit canonical participant mapping", () => {
  const input = fixture();
  input.tba.alliances.red.team_keys[0] = "frc4159B";
  expect(() => fuseMatch(input, [8033])).toThrow(
    "explicit participant mapping",
  );
  const mapped = {
    ...input,
    slots: input.slots.map((s) =>
      s.teamNumber === 3 ? { ...s, externalParticipantKey: "frc4159B" } : s,
    ),
  };
  const result = fuseMatch(mapped, [8033]);
  expect(result.alliances[0]!.pointsConserved).toBe(true);
  expect(result.alliances[0]!.teams.map((t) => t.teamNumber)).toEqual([
    1, 2, 3,
  ]);
});

test("a TBA-backed counter retraction quarantines attribution without rewriting readings", () => {
  const input = fixture();
  input.ocr.observations.splice(
    3,
    0,
    { time: 26, red: 9, blue: 0, confidence: 95 },
    { time: 27, red: 8, blue: 0, confidence: 95 },
  );
  const original = JSON.stringify(input);
  const result = fuseMatch(input, [8033]) as any;
  expect(JSON.stringify(input)).toBe(original);
  expect(result.diagnostics.counterCorrections).toEqual([
    { from: 24, to: 27, discardedTimestamps: [26] },
  ]);
  const red = result.alliances[0];
  expect(red.pointsConserved).toBe(true);
  expect(
    red.intervals
      .filter((i: any) => i.from < 33 && i.to > 18)
      .every((i: any) => i.allocation.every((a: any) => a.fuelMicros === 0)),
  ).toBe(true);
  expect(
    red.teams.reduce((n: number, t: any) => n + t.estimatedPoints, 0) +
      red.unattributedPoints +
      red.foulPoints,
  ).toBe(15);
});

test("an official remainder is not attributed to a late shooter after a counter correction", () => {
  const input = fixture();
  input.ocr.observations.splice(
    3,
    0,
    { time: 26, red: 9, blue: 0, confidence: 95 },
    { time: 27, red: 8, blue: 0, confidence: 95 },
  );
  input.ocr.observations.find((s) => s.time === 30)!.red = 9;
  input.ocr.observations.find((s) => s.time === 163)!.red = 9;
  input.reports[1]!.events[0]!.time = 159;
  input.reports[1]!.events[1]!.time = 163;
  const red = fuseMatch(input, [8033]).alliances[0] as any;
  expect(red.intervals.at(-1).source).toBe("TBA_REMAINDER");
  expect(
    red.intervals.at(-1).allocation.every((a: any) => a.fuelMicros === 0),
  ).toBe(true);
  expect(red.pointsConserved).toBe(true);
});

function withChannels() {
  const input: any = fixture();
  input.ocr.channels = Object.fromEntries(
    ["red", "blue"].map((color) => [
      color,
      input.ocr.observations.map((s: any) => ({
        time: s.time,
        count: s[color],
        confidence: s.confidence,
      })),
    ]),
  );
  return input;
}
test("independent counters close one alliance gap without fabricating its counterpart", () => {
  const input = withChannels();
  input.ocr.channels.red.splice(
    3,
    0,
    { time: 25, count: 7, confidence: 95 },
    { time: 27, count: 8, confidence: 95 },
  );
  const result = fuseMatch(input, [8033]) as any;
  expect(result.algorithm).toBe(
    "scoreboard-constrained-fusion-v5-tba-consensus",
  );
  expect(result.diagnostics.allianceChannels.red.samples).toBe(7);
  expect(result.diagnostics.allianceChannels.blue.samples).toBe(5);
  const red = result.alliances[0];
  expect(red.intervals.find((i: any) => i.to === 27).coverage).toBe("dense");
  expect(
    red.intervals
      .find((i: any) => i.to === 24)
      .allocation.every((a: any) => a.fuelMicros === 0),
  ).toBe(true);
  expect(
    red.teams.find((t: any) => t.teamNumber === 2).teleopFuelCount,
  ).toBeGreaterThan(0);
  expect(red.pointsConserved).toBe(true);
  const shuffled = structuredClone(input);
  shuffled.ocr.channels.red.reverse();
  shuffled.ocr.channels.blue.reverse();
  expect(fuseMatch(shuffled, [8033])).toEqual(result);
});
test("a blue counter retraction does not quarantine independently observed red scoring", () => {
  const input = withChannels();
  input.ocr.channels.red.splice(
    3,
    0,
    { time: 25, count: 7, confidence: 95 },
    { time: 27, count: 8, confidence: 95 },
  );
  input.ocr.channels.blue.splice(
    3,
    0,
    { time: 25, count: 2, confidence: 95 },
    { time: 27, count: 0, confidence: 95 },
  );
  const result = fuseMatch(input, [8033]) as any;
  expect(result.diagnostics.allianceChannels.red.counterCorrections).toEqual(
    [],
  );
  expect(
    result.diagnostics.allianceChannels.blue.counterCorrections,
  ).toHaveLength(1);
  const interval = result.alliances[0].intervals.find((i: any) => i.to === 27);
  expect(interval.coverage).toBe("dense");
  expect(interval.supportingTeams).toContain(2);
  expect(result.alliances.every((a: any) => a.pointsConserved)).toBe(true);
});
test("independent evidence refuses low confidence and conflicting timestamps", () => {
  const input = withChannels();
  input.ocr.channels.red[0].confidence = 84;
  expect(() => fuseMatch(input, [8033])).toThrow();
  input.ocr.channels.red[0].confidence = 85;
  input.ocr.channels.red.push({ time: 24, count: 7, confidence: 95 });
  expect(() => fuseMatch(input, [8033])).toThrow(
    "Conflicting alliance OCR timestamps",
  );
});

test("conflicting phase claims keep their share unknown instead of donating it to another robot", () => {
  const input: any = fixture();
  const autoCopy = structuredClone(input.reports[0]);
  autoCopy.uuid = "second-auto";
  autoCopy.teamNumber = 2;
  autoCopy.events = autoCopy.events.map((e: any) => ({
    ...e,
    eventUuid: "second-" + e.eventUuid,
  }));
  input.reports[1].events.push(...autoCopy.events);
  input.reports.push({
    uuid: "negative",
    teamNumber: 1,
    alliance: "RED",
    sourceTeamNumber: 1967,
    events: [],
  });
  const result = fuseMatch(input, [8033, 1967]) as any;
  const red = result.alliances[0];
  expect(red.teams.find((t: any) => t.teamNumber === 1).autoFuelCount).toBe(0);
  expect(red.teams.find((t: any) => t.teamNumber === 2).autoFuelCount).toBe(3);
  expect(red.phases[0].unattributedFuel).toBe(1);
  expect(
    red.attributionEvidence[0].robots.find((r: any) => r.teamNumber === 1),
  ).toMatchObject({ eligible: false, support: 500000 });
  expect(red.pointsConserved).toBe(true);
});

test("many reports from one source cannot outvote another source's explicit no-score evidence", () => {
  const input: any = fixture();
  input.reports.push({
    uuid: "negative",
    teamNumber: 1,
    alliance: "RED",
    sourceTeamNumber: 1967,
    events: [],
  });
  for (let i = 0; i < 20; i++) {
    const r = structuredClone(input.reports[0]);
    r.uuid = `repeat-${i}`;
    r.events = r.events.map((e: any) => ({
      ...e,
      eventUuid: `${i}-${e.eventUuid}`,
      quantity: e.quantity ? e.quantity + i : 0,
    }));
    input.reports.push(r);
  }
  const first = fuseMatch(input, [1967, 8033]) as any;
  expect(
    first.alliances[0].teams.find((t: any) => t.teamNumber === 1).autoFuelCount,
  ).toBe(0);
  input.reports.reverse();
  for (const r of input.reports) r.events.reverse();
  expect(fuseMatch(input, [8033, 1967])).toEqual(first);
});

test("auto consensus does not certify a conflicting teleop claim", () => {
  const input: any = fixture();
  const confirmation = structuredClone(input.reports[0]);
  confirmation.uuid = "confirmation";
  confirmation.sourceTeamNumber = 1967;
  confirmation.events = confirmation.events.map((e: any) => ({
    ...e,
    eventUuid: "confirmation-" + e.eventUuid,
  }));
  input.reports.push(confirmation);
  input.reports[0].events.push(
    ...input.reports[1].events.map((e: any) => ({
      ...e,
      eventUuid: "extra-" + e.eventUuid,
    })),
  );
  const red = fuseMatch(input, [1967, 8033]).alliances[0] as any;
  expect(red.teams.find((t: any) => t.teamNumber === 1).autoFuelCount).toBe(4);
  expect(red.teams.find((t: any) => t.teamNumber === 1).teleopFuelCount).toBe(
    0,
  );
  expect(
    red.attributionEvidence[0].robots.find((r: any) => r.teamNumber === 1)
      .eligible,
  ).toBe(true);
  expect(
    red.attributionEvidence[1].robots.find((r: any) => r.teamNumber === 1)
      .eligible,
  ).toBe(false);
  expect(red.pointsConserved).toBe(true);
});

test("missing report evidence is explicit and leaves fuel unattributed", () => {
  const input = fixture();
  input.reports = [];
  const result = fuseMatch(input, [8033]) as any;
  expect(result.attributionStatus).toBe("REPORTS_MISSING");
  expect(result.alliances[0].unattributedFuel).toBe(10);
  expect(result.alliances.every((a: any) => a.pointsConserved)).toBe(true);
});

test("contribution exports keep six robots separate from alliance-only credit and reject broken budgets", () => {
  const estimate = fuseMatch(fixture(), [8033]) as any;
  const table = contributionTables([estimate]);
  expect(table.teams).toHaveLength(6);
  expect(table.alliances).toHaveLength(2);
  const red = table.alliances.find((a) => a.alliance === "RED")!;
  expect(red.foulCredit).toBe(5);
  expect(
    Number(red.attributedRobotPoints) +
      Number(red.unattributedPoints) +
      Number(red.foulCredit),
  ).toBe(15);
  expect(table.teams.every((t) => Number(t.teamNumber) > 0)).toBe(true);
  expect(contributionCsv(table.teams).split("\n")).toHaveLength(8);
  expect(() => contributionTables([estimate, estimate])).toThrow(
    "Duplicate export match",
  );
  estimate.alliances[0].teams[0].estimatedFuel++;
  expect(() => contributionTables([estimate])).toThrow("Export totals");
});

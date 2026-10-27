import { test, expect } from "bun:test";
import { fuseMatch } from "../src/ocr/fusion";
function fixture() {
  const keys = ["frc3", "frc1", "frc2"],
    blue = ["frc6", "frc4", "frc5"];
  const b = (auto: number, tele: number, foul: number) => ({
    hubScore: {
      autoCount: auto,
      autoPoints: auto,
      teleopCount: tele,
      teleopPoints: tele,
      totalCount: auto + tele,
      totalPoints: auto + tele,
      endgameCount: tele,
      endgamePoints: tele,
    },
    autoTowerPoints: 0,
    endGameTowerPoints: 0,
    totalTowerPoints: 0,
    totalAutoPoints: auto,
    totalTeleopPoints: tele,
    totalPoints: auto + tele + foul,
    foulPoints: foul,
    minorFoulCount: 0,
    majorFoulCount: 0,
    autoTowerRobot1: "None",
    autoTowerRobot2: "None",
    autoTowerRobot3: "None",
    endGameTowerRobot1: "None",
    endGameTowerRobot2: "None",
    endGameTowerRobot3: "None",
  });
  const red = b(4, 6, 5),
    bb = b(0, 0, 0);
  const cycle = (
    team: number,
    id: string,
    start: number,
    end: number,
    q: number,
  ) => ({
    uuid: id,
    teamNumber: team,
    alliance: team <= 3 ? "RED" : "BLUE",
    sourceTeamNumber: 8033,
    events: [
      {
        eventUuid: id + "s",
        time: start,
        action: "START_SCORING",
        quantity: 0,
      },
      { eventUuid: id + "e", time: end, action: "STOP_SCORING", quantity: q },
    ],
  });
  return {
    matchKey: "2026test_qm1",
    slots: [
      ...keys.map((k, i) => ({
        teamNumber: Number(k.slice(3)),
        alliance: "RED",
        station: i + 1,
      })),
      ...blue.map((k, i) => ({
        teamNumber: Number(k.slice(3)),
        alliance: "BLUE",
        station: i + 1,
      })),
    ],
    reports: [cycle(1, "auto", 17, 21, 4), cycle(2, "tele", 24, 29, 6)],
    ocr: {
      matchKey: "2026test_qm1",
      status: "PARTIAL",
      observations: [
        { time: 0, red: 0, blue: 0, confidence: 95 },
        { time: 19, red: 0, blue: 0, confidence: 95 },
        { time: 24, red: 6, blue: 0, confidence: 95 },
        { time: 30, red: 10, blue: 0, confidence: 95 },
        { time: 163, red: 10, blue: 0, confidence: 95 },
      ],
    },
    tba: {
      key: "2026test_qm1",
      alliances: {
        red: { team_keys: keys, score: 15 },
        blue: { team_keys: blue, score: 0 },
      },
      score_breakdown: { red, blue: bb },
    },
  };
}
test("official cumulative auto budget separates delayed auto updates from teleop", () => {
  const r = fuseMatch(fixture(), [8033]);
  expect(r.algorithm).toBe("scoreboard-constrained-fusion-v3-tba");
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
    red.teams.reduce((n: number, t: any) => n + t.estimatedPoints, 0),
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
  expect(red.phases[1].unattributedFuel).toBe(4);
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
  expect(result.algorithm).toBe("scoreboard-constrained-fusion-v4-tba");
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

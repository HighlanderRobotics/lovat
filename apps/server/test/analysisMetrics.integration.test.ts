import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventAction, Position, User } from "@lovat/db";

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/missing",
);
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost/missing");
if (
  process.env.LOVAT_DB_TEST !== "1" ||
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== "/lovat_test" ||
  !["localhost", "127.0.0.1"].includes(redisUrl.hostname) ||
  redisUrl.pathname !== "/15"
)
  throw new Error(
    "Integration tests require local lovat_test PostgreSQL and Redis database 15",
  );
process.env.DOTENV_CONFIG_PATH = "/dev/null";
const { db } = await import("@lovat/db");
const { closeRedis, kv } = await import("../src/redisClient.js");
const { Metric, MetricsBreakdown } =
  await import("../src/handler/analysis/analysisConstants.js");
const { averageManyFast } =
  await import("../src/handler/analysis/coreAnalysis/averageManyFast.js");
const { arrayAndAverageTeams, weightedTourAvgLeft } =
  await import("../src/handler/analysis/coreAnalysis/arrayAndAverageTeams.js");
const { averageAllTeamFast } =
  await import("../src/handler/analysis/coreAnalysis/averageAllTeamFast.js");
const { nonEventMetric } =
  await import("../src/handler/analysis/coreAnalysis/nonEventMetric.js");

const fixtureId = randomUUID();
const sourceTeam = -Math.floor(Math.random() * 1_000_000_000) - 1;
const otherSourceTeam = sourceTeam - 1;
const robot = sourceTeam - 2;
const missingRobot = sourceTeam - 3;
const tournamentKey = `metrics-${fixtureId}`;
const hiddenTournament = `hidden-${fixtureId}`;
const fixtureTournaments = [tournamentKey, hiddenTournament];
const matchKey = `match-${fixtureId}`;
const scouterId = randomUUID();
const otherScouterId = randomUUID();
const user: User = {
  id: `metrics-${fixtureId}`,
  email: `${fixtureId}@example.invalid`,
  emailVerified: true,
  username: null,
  teamNumber: sourceTeam,
  role: "ANALYST",
  teamSourceRule: { mode: "INCLUDE", items: [sourceTeam] },
  tournamentSourceRule: { mode: "INCLUDE", items: [tournamentKey] },
};
const event = (
  action: EventAction,
  time: number,
  quantity: number | null = null,
  points = 0,
  position: Position = "HUB",
) => ({ action, time, quantity, points, position });
const reportData = {
  startTime: new Date("2026-01-01T00:00:00Z"),
  notes: "Synthetic metric report",
  robotRoles: ["SCORING", "FEEDING"] as ("SCORING" | "FEEDING")[],
  driverAbility: 4,
  accuracy: 3,
  beached: "NEITHER" as const,
  defenseEffectiveness: 3,
  feederTypes: ["CONTINUOUS"] as "CONTINUOUS"[],
  intakeType: "NEITHER" as const,
  fieldTraversal: "NONE" as const,
  scoresWhileMoving: true,
  disrupts: false,
  autoClimb: "SUCCEEDED" as const,
  endgameClimb: "L2" as const,
};
const events = [
  event("START_MATCH", 0),
  event("START_SCORING", 10),
  event("STOP_SCORING", 20, 10, 10),
  event("START_SCORING", 30),
  event("STOP_SCORING", 40, 20, 20),
  event("START_FEEDING", 50),
  event("STOP_FEEDING", 54, 8),
  event("START_DEFENDING", 60),
  event("STOP_DEFENDING", 62),
  event("START_CAMPING", 70),
  event("STOP_CAMPING", 73),
  event("CLIMB", 20),
  event("CLIMB", 150),
  event("INTAKE", 80, null, 0, "OUTPOST"),
  event("INTAKE", 81, null, 0, "DEPOT"),
];
beforeAll(async () => {
  for (const number of [sourceTeam, otherSourceTeam]) {
    await db.team.create({ data: { number, name: "Synthetic analysis team" } });
    await db.registeredTeam.create({
      data: {
        number,
        code: `${fixtureId}-${number}`,
        email: `${fixtureId}-${number}@example.invalid`,
      },
    });
  }
  await db.scouter.create({
    data: { uuid: scouterId, sourceTeamNumber: sourceTeam },
  });
  await db.scouter.create({
    data: { uuid: otherScouterId, sourceTeamNumber: otherSourceTeam },
  });
  for (const key of [tournamentKey, hiddenTournament])
    await db.tournament.create({
      data: { key, name: "Synthetic metric tournament" },
    });
  await db.teamMatchData.create({
    data: {
      key: matchKey,
      teamNumber: robot,
      tournamentKey,
      matchType: "QUALIFICATION",
      matchNumber: 1,
    },
  });
  // Two identical scouting observations must not double the robot's rates or totals.
  for (let i = 0; i < 2; i++)
    await db.scoutReport.create({
      data: {
        ...reportData,
        scouterUuid: scouterId,
        teamMatchKey: matchKey,
        events: { create: events },
      },
    });
  await db.scoutReport.create({
    data: {
      ...reportData,
      scouterUuid: otherScouterId,
      teamMatchKey: matchKey,
      events: { create: [event("STOP_SCORING", 20, 999, 999)] },
    },
  });
  await db.teamMatchData.create({
    data: {
      key: `hidden-match-${fixtureId}`,
      teamNumber: robot,
      tournamentKey: hiddenTournament,
      matchType: "QUALIFICATION",
      matchNumber: 2,
    },
  });
  await db.scoutReport.create({
    data: {
      ...reportData,
      scouterUuid: scouterId,
      teamMatchKey: `hidden-match-${fixtureId}`,
      events: { create: [event("STOP_SCORING", 20, 888, 888)] },
    },
  });
});

afterAll(async () => {
  const rows = await db.cachedAnalysis.findMany({
    where: { key: { contains: fixtureId } },
    select: { key: true },
  });
  if (rows.length) await kv.del(rows.map((row) => row.key));
  await db.cachedAnalysis.deleteMany({
    where: { key: { contains: fixtureId } },
  });
  await db.team.deleteMany({
    where: { number: { in: [sourceTeam, otherSourceTeam] } },
  });
  await db.tournament.deleteMany({
    where: { key: { in: fixtureTournaments } },
  });
  await closeRedis();
  await db.$disconnect();
});

// Hand-calculated values: 75% accuracy applies only to scored fuel points;
// climbing adds 15 auto + 20 endgame points. Rates divide fuel by action time.
const cases: [string, number, number][] = [
  ["total points", Metric.totalPoints, 57.5],
  ["auto points", Metric.autoPoints, 22.5],
  ["teleop points", Metric.teleopPoints, 15],
  ["scoring rate", Metric.fuelPerSecond, 1.5],
  ["accuracy", Metric.accuracy, 75],
  ["volleys", Metric.volleysPerMatch, 2],
  ["L1 timing", Metric.l1StartTime, -1],
  ["L2 timing", Metric.l2StartTime, 8],
  ["L3 timing", Metric.l3StartTime, -1],
  ["auto timing", Metric.autoClimbStartTime, 3],
  ["driver ability", Metric.driverAbility, 4],
  ["contact defense time", Metric.contactDefenseTime, 2],
  ["defense effectiveness", Metric.defenseEffectiveness, 3],
  ["camping defense time", Metric.campingDefenseTime, 3],
  ["total defense time", Metric.totalDefenseTime, 5],
  ["feeding time", Metric.timeFeeding, 4],
  ["feeding rate", Metric.feedingRate, 2],
  ["feeds", Metric.feedsPerMatch, 1],
  ["fuel output", Metric.totalFuelOutputted, 38],
  ["fuel fed", Metric.totalBallsFed, 8],
  ["fuel throughput", Metric.totalBallThroughput, 38],
  ["outpost intakes", Metric.outpostIntakes, 1],
];

describe("team analysis against real reports with source filters", () => {
  it.each([
    ["no feeding", [], 2],
    [
      "unequal durations",
      [event("START_FEEDING", 50), event("STOP_FEEDING", 58, 8)],
      16 / 12,
    ],
  ] as const)(
    "pools population feeding quantities and active time with %s",
    async (name, additionalEvents, expected) => {
      const key = `feeding-${name}-${fixtureId}`;
      fixtureTournaments.push(key);
      await db.tournament.create({ data: { key, name: "Feeding regression" } });
      const teamMatchKey = `match-${key}`;
      await db.teamMatchData.create({
        data: {
          key: teamMatchKey,
          tournamentKey: key,
          teamNumber: robot,
          matchType: "QUALIFICATION",
          matchNumber: 1,
        },
      });
      for (const feedingEvents of [
        [event("START_FEEDING", 50), event("STOP_FEEDING", 54, 8)],
        additionalEvents,
      ]) {
        await db.scoutReport.create({
          data: {
            ...reportData,
            scouterUuid: scouterId,
            teamMatchKey,
            events: { create: [...feedingEvents] },
          },
        });
      }
      const scopedUser = {
        ...user,
        id: key,
        tournamentSourceRule: { mode: "INCLUDE", items: [key] },
      };
      expect(
        await averageAllTeamFast(scopedUser, { metric: Metric.feedingRate }),
      ).toBeCloseTo(expected);
      const batched = await averageManyFast(scopedUser, {
        teams: [robot],
        metrics: [Metric.feedingRate],
      });
      expect(batched[String(Metric.feedingRate)][String(robot)]).toBeCloseTo(
        expected,
      );
      const timeline = await arrayAndAverageTeams(scopedUser, {
        teams: [robot],
        metric: Metric.feedingRate,
      });
      expect(timeline[String(robot)].average).toBeCloseTo(expected);
      await db.tournament.delete({ where: { key } });
    },
  );
  it.each(cases)(
    "computes %s in batched metrics without counting extra scouters twice",
    async (_name, metric, expected) => {
      const result = await averageManyFast(user, {
        teams: [robot],
        metrics: [metric],
      });
      expect(result[String(metric)][String(robot)]).toBe(expected);
    },
  );
  it.each(cases)(
    "computes %s in match timelines and applies the same source filters",
    async (_name, metric, expected) => {
      const result = await arrayAndAverageTeams(user, {
        teams: [robot],
        metric,
      });
      expect(result[String(robot)]).toEqual({
        average: expected === -1 ? 0 : expected,
        timeLine: [
          {
            match: matchKey,
            dataPoint: expected,
            tournamentName: "Synthetic metric tournament",
          },
        ],
      });
    },
  );
  it.each(cases)(
    "computes %s in population SQL without including hidden sources",
    async (_name, metric, expected) => {
      expect(await averageAllTeamFast(user, { metric })).toBe(
        expected === -1 ? 0 : expected,
      );
    },
  );
  it.each(cases)(
    "returns zero for %s when population source rules include nothing",
    async (_name, metric) => {
      const nobody = {
        ...user,
        id: `population-empty-${fixtureId}`,
        teamSourceRule: { mode: "INCLUDE", items: [] },
      };
      expect(await averageAllTeamFast(nobody, { metric })).toBe(0);
    },
  );
  it.each(["teams", "tournaments"])(
    "excludes hidden %s using EXCLUDE source rules",
    async (rule) => {
      const viewer = {
        ...user,
        id: `exclude-${rule}-${fixtureId}`,
        ...(rule === "teams"
          ? { teamSourceRule: { mode: "EXCLUDE", items: [otherSourceTeam] } }
          : {
              tournamentSourceRule: {
                mode: "EXCLUDE",
                items: [hiddenTournament],
              },
            }),
      };
      expect(
        await averageAllTeamFast(viewer, { metric: Metric.totalPoints }),
      ).toBe(57.5);
      expect(
        (
          await averageManyFast(viewer, {
            teams: [robot],
            metrics: [Metric.totalPoints],
          })
        )[String(Metric.totalPoints)][String(robot)],
      ).toBe(57.5);
      expect(
        (
          await arrayAndAverageTeams(viewer, {
            teams: [robot],
            metric: Metric.totalPoints,
          })
        )[String(robot)].average,
      ).toBe(57.5);
      expect(
        await nonEventMetric(viewer, {
          team: robot,
          metric: MetricsBreakdown.climbResult,
        }),
      ).toMatchObject({ L2: 1 });
    },
  );
  it("distinguishes an unscouted team from a scouted team that scored zero", async () => {
    expect(
      await averageManyFast(user, {
        teams: [missingRobot],
        metrics: [Metric.totalPoints],
      }),
    ).toEqual({ [Metric.totalPoints]: { [missingRobot]: -1 } });
    expect(
      await arrayAndAverageTeams(user, {
        teams: [missingRobot],
        metric: Metric.totalPoints,
      }),
    ).toEqual({ [missingRobot]: { average: 0, timeLine: [] } });
  });
  it("returns no visible reports for empty INCLUDE rules", async () => {
    const nobody = {
      ...user,
      id: `nobody-${fixtureId}`,
      teamSourceRule: { mode: "INCLUDE", items: [] },
    };
    expect(
      await averageManyFast(nobody, {
        teams: [robot],
        metrics: [Metric.totalPoints],
      }),
    ).toEqual({ [Metric.totalPoints]: { [robot]: -1 } });
  });
  it("weights each new tournament at 80% after averaging its matches", () => {
    expect(weightedTourAvgLeft([])).toBe(0);
    expect(weightedTourAvgLeft([10])).toBe(10);
    expect(weightedTourAvgLeft([10, 20, 30])).toBeCloseTo(27.6);
  });
});

describe("categorical analysis uses actual PostgreSQL enum and array fields", () => {
  it.each([
    [MetricsBreakdown.robotRole, { SCORING: 0.5, FEEDING: 0.5, CYCLING: 0 }],
    [MetricsBreakdown.fieldTraversal, { NONE: 1 }],
    [MetricsBreakdown.climbResult, { L2: 1, L1: 0 }],
    [MetricsBreakdown.beached, { NEITHER: 1 }],
    [MetricsBreakdown.scoresWhileMoving, { TRUE: 1, FALSE: 0 }],
    [MetricsBreakdown.disrupts, { FALSE: 1, TRUE: 0 }],
    [MetricsBreakdown.autoClimb, { SUCCEEDED: 1, FAILED: 0 }],
    [MetricsBreakdown.feederType, { CONTINUOUS: 1 }],
    [MetricsBreakdown.intakeType, { NEITHER: 1 }],
  ])(
    "maps %s into percentages and supplies zero for unobserved categories",
    async (metric, expected) => {
      const result = await nonEventMetric(user, { team: robot, metric });
      expect(result).toMatchObject(expected);
      expect(
        Object.values(result).reduce<number>(
          (sum, value) => sum + (value as number),
          0,
        ),
      ).toBe(1);
    },
  );
  it("returns zeros when no report is visible", async () => {
    const nobody = {
      ...user,
      id: `empty-${fixtureId}`,
      tournamentSourceRule: { mode: "INCLUDE", items: [] },
    };
    const result = await nonEventMetric(nobody, {
      team: robot,
      metric: MetricsBreakdown.robotRole,
    });
    expect(Object.values(result).every((value) => value === 0)).toBe(true);
  });
});

let edgeMatchNumber = 10;
const edgeReport = async (
  overrides: Partial<
    Pick<
      import("@lovat/db").ScoutReport,
      "accuracy" | "autoClimb" | "endgameClimb"
    >
  >,
  edgeEvents: typeof events,
) => {
  const team = robot - edgeMatchNumber++;
  await db.teamMatchData.create({
    data: {
      key: `edge-${team}-${fixtureId}`,
      teamNumber: team,
      tournamentKey,
      matchType: "QUALIFICATION",
      matchNumber: edgeMatchNumber,
      scoutReports: {
        create: {
          ...reportData,
          ...overrides,
          scouterUuid: scouterId,
          events: { create: edgeEvents },
        },
      },
    },
  });
  return team;
};

describe.sequential("analysis boundaries and missing observations", () => {
  it("keeps zero scores finite and ignores failed or missing climbs", async () => {
    const team = await edgeReport(
      { accuracy: null, autoClimb: "FAILED", endgameClimb: "FAILED" },
      [],
    );
    const expected = cases.map(([_name, metric]) => [
      metric,
      [
        Metric.l1StartTime,
        Metric.l2StartTime,
        Metric.l3StartTime,
        Metric.autoClimbStartTime,
      ].includes(metric)
        ? -1
        : metric === Metric.driverAbility
          ? 4
          : metric === Metric.defenseEffectiveness
            ? 3
            : 0,
    ]);
    const batch = await averageManyFast(user, {
      teams: [team],
      metrics: expected.map(([metric]) => metric),
    });
    for (const [metric, value] of expected) {
      expect(batch[String(metric)][String(team)]).toBe(value);
      const timeline = await arrayAndAverageTeams(user, {
        teams: [team],
        metric,
      });
      expect(timeline[String(team)].timeLine?.[0].dataPoint).toBe(value);
    }
  });

  it("defaults missing accuracy to 100% and treats accuracy level zero as 25%", async () => {
    for (const [accuracy, expected] of [
      [null, 40],
      [0, 10],
    ] as const) {
      const team = await edgeReport(
        { accuracy, autoClimb: "NOT_ATTEMPTED", endgameClimb: "NOT_ATTEMPTED" },
        [event("STOP_SCORING", 23, 40, 40)],
      );
      const batch = await averageManyFast(user, {
        teams: [team],
        metrics: [Metric.totalPoints, Metric.autoPoints],
      });
      expect(batch[String(Metric.totalPoints)][String(team)]).toBe(expected);
      expect(batch[String(Metric.autoPoints)][String(team)]).toBe(expected);
      const timeline = await arrayAndAverageTeams(user, {
        teams: [team],
        metric: Metric.totalPoints,
      });
      expect(timeline[String(team)].average).toBe(expected);
    }
  });

  it("does not divide by zero for short feeding observations", async () => {
    const team = await edgeReport({}, [
      event("START_FEEDING", 50),
      event("STOP_FEEDING", 50.25, 8),
    ]);
    const batch = await averageManyFast(user, {
      teams: [team],
      metrics: [Metric.feedingRate, Metric.timeFeeding],
    });
    expect(batch[String(Metric.feedingRate)][String(team)]).toBe(0);
    expect(batch[String(Metric.timeFeeding)][String(team)]).toBe(0);
    const timeline = await arrayAndAverageTeams(user, {
      teams: [team],
      metric: Metric.feedingRate,
    });
    expect(timeline[String(team)].average).toBe(0);
  });

  it.each([
    ["L1", Metric.l1StartTime],
    ["L3", Metric.l3StartTime],
  ] as const)(
    "uses the first valid %s climb and omits climbs outside match time",
    async (endgameClimb, metric) => {
      const team = await edgeReport({ endgameClimb }, [
        event("CLIMB", 159),
        event("CLIMB", 155),
        event("CLIMB", 24),
        event("CLIMB", 23),
      ]);
      const batch = await averageManyFast(user, {
        teams: [team],
        metrics: [metric, Metric.autoClimbStartTime],
      });
      expect(batch[String(metric)][String(team)]).toBe(134);
      expect(batch[String(Metric.autoClimbStartTime)][String(team)]).toBe(0);
      const timeline = await arrayAndAverageTeams(user, {
        teams: [team],
        metric,
      });
      expect(timeline[String(team)].average).toBe(134);
    },
  );
});

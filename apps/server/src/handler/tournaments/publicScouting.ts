import type { Request, Response } from "express";
import type { User, RobotRole } from "@lovat/db";
import prisma from "../../prismaClient.js";
import { publicCache } from "../../lib/publicCache.js";
import { Metric } from "../analysis/analysisConstants.js";
import { arrayAndAverageTeams } from "../analysis/coreAnalysis/arrayAndAverageTeams.js";
import { matchPredictionLogic } from "../analysis/predictions/matchPredictionLogic.js";

// Anonymous access is deliberately limited to these aggregate projections.
// Existing authenticated analysis retains each user's source restrictions.
async function publicContext(year: number, teams: number[]): Promise<User> {
  const events = await prisma.teamMatchData.findMany({
    where: {
      teamNumber: { in: teams },
      tournament: { seasonYear: year },
      scoutReports: { some: {} },
    },
    distinct: ["tournamentKey"],
    select: { tournamentKey: true },
  });

  return {
    id: `public-scouting:${year}`,
    email: "public@example.invalid",
    emailVerified: false,
    username: null,
    teamNumber: null,
    role: "ANALYST",
    teamSourceRule: { mode: "EXCLUDE", items: [] },
    tournamentSourceRule: {
      mode: "INCLUDE",
      items: events.map((event) => event.tournamentKey).sort(),
    },
  };
}

export function mostCommonRoles(
  reports: { robotRoles: RobotRole[] }[],
): RobotRole[] {
  const votes = new Map<RobotRole, number>();

  for (const report of reports) {
    for (const role of new Set(report.robotRoles))
      votes.set(role, (votes.get(role) ?? 0) + 1);
  }

  const highest = Math.max(0, ...votes.values());

  return [...votes]
    .filter(([, count]) => count === highest)
    .map(([role]) => role)
    .sort();
}

export function scoutingCoverage(
  slots: {
    teamNumber: number;
    alliance: string | null;
    scoutReports: unknown[];
  }[],
): { reported: number; expected: number; complete: boolean } {
  const participants = slots.filter(
    (slot) => slot.alliance === "BLUE" || slot.alliance === "RED",
  );
  const reported = new Set(
    participants
      .filter((slot) => slot.scoutReports.length > 0)
      .map((slot) => slot.teamNumber),
  );
  const expected = new Set(participants.map((slot) => slot.teamNumber)).size;

  return {
    reported: reported.size,
    expected,
    complete:
      expected === 6 &&
      participants.length === 6 &&
      reported.size === 6 &&
      participants.filter((slot) => slot.alliance === "BLUE").length === 3 &&
      participants.filter((slot) => slot.alliance === "RED").length === 3,
  };
}

// Midrank percentile: ties share a rank, with the lowest/highest unique values at 0/100.
export function metricPercentile(
  value: number,
  cohort: number[],
): number | null {
  const valid = cohort.filter(Number.isFinite);
  if (!Number.isFinite(value) || valid.length < 2) return null;

  const below = valid.filter((entry) => entry < value).length;
  const equal = valid.filter((entry) => entry === value).length;
  if (!equal) return null;

  return (
    Math.round(((below + (equal - 1) / 2) / (valid.length - 1)) * 1000) / 10
  );
}

async function seasonTeamMetrics(year: number) {
  return publicCache(`scouting:team-distribution:v1:${year}`, async () => {
    const rows = await prisma.teamMatchData.findMany({
      where: { tournament: { seasonYear: year }, scoutReports: { some: {} } },
      distinct: ["teamNumber"],
      select: { teamNumber: true },
      orderBy: { teamNumber: "asc" },
    });
    const teams = rows.map((row) => row.teamNumber);
    const user = await publicContext(year, teams);
    const result: {
      number: number;
      matches: number;
      points: number;
      auto: number;
      teleop: number;
    }[] = [];

    // Bound each analysis query rather than loading every season report at once.
    for (let start = 0; start < teams.length; start += 100) {
      const batch = teams.slice(start, start + 100);
      const values = await Promise.all(
        [Metric.totalPoints, Metric.autoPoints, Metric.teleopPoints].map(
          (metric) => arrayAndAverageTeams(user, { teams: batch, metric }),
        ),
      );

      for (const number of batch) {
        const total = values[0]?.[number];
        const auto = values[1]?.[number];
        const teleop = values[2]?.[number];

        if (
          !total?.timeLine?.length ||
          !auto?.timeLine?.length ||
          !teleop?.timeLine?.length ||
          ![total.average, auto.average, teleop.average].every(Number.isFinite)
        )
          continue;

        result.push({
          number,
          matches: total.timeLine.length,
          points: total.average,
          auto: auto.average,
          teleop: teleop.average,
        });
      }
    }

    return result;
  });
}

export async function getPublicTeamMetrics(
  req: Request,
  res: Response,
): Promise<void> {
  const number = Number(req.params.number);
  const year = Number(req.params.year);

  if (
    !Number.isInteger(number) ||
    number <= 0 ||
    number > 2_147_483_647 ||
    !Number.isInteger(year) ||
    year < 1992 ||
    year > 9999
  ) {
    res.status(400).json({ error: "Invalid team or year" });
    return;
  }

  try {
    const metrics = await publicCache(
      `scouting:team:v2:${number}:${year}`,
      async () => {
        // Lovat's current scoring engine is for REBUILT; never apply it to older games.
        if (year !== 2026) return null;

        const cohort = await seasonTeamMetrics(year);
        const team = cohort.find((entry) => entry.number === number);

        if (!team) return null;

        return {
          matches: team.matches,
          points: team.points,
          auto: team.auto,
          teleop: team.teleop,
          percentiles: {
            points: metricPercentile(
              team.points,
              cohort.map((entry) => entry.points),
            ),
            auto: metricPercentile(
              team.auto,
              cohort.map((entry) => entry.auto),
            ),
            teleop: metricPercentile(
              team.teleop,
              cohort.map((entry) => entry.teleop),
            ),
          },
        };
      },
    );

    res.set("Cache-Control", "public, max-age=60");
    res.json({ metrics });
  } catch {
    res.status(503).json({ error: "Metrics unavailable" });
  }
}

export async function getPublicMatchAnalysis(
  req: Request,
  res: Response,
): Promise<void> {
  const key = req.params.key;

  if (
    typeof key !== "string" ||
    !/^\d{4}[a-z0-9]+_(?:qm\d+|(?:ef|qf|sf|f)\d+m\d+)$/.test(key)
  ) {
    res.status(400).json({ error: "Invalid match" });
    return;
  }

  try {
    const analysis = await publicCache(`scouting:match:v3:${key}`, async () => {
      const match = await prisma.match.findUnique({
        where: { key },
        select: {
          tournament: { select: { seasonYear: true } },
          teamSlots: {
            select: {
              teamNumber: true,
              alliance: true,
              scoutReports: { select: { robotRoles: true } },
            },
          },
        },
      });

      if (!match) return null;

      const roles = match.teamSlots.flatMap((slot) => {
        return mostCommonRoles(slot.scoutReports).map((role) => ({
          teamNumber: slot.teamNumber,
          role,
        }));
      });
      const blue = match.teamSlots
        .filter((slot) => slot.alliance === "BLUE")
        .map((slot) => slot.teamNumber);
      const red = match.teamSlots
        .filter((slot) => slot.alliance === "RED")
        .map((slot) => slot.teamNumber);
      let prediction: { blueWinning: number; redWinning: number } | null = null;

      if (
        match.tournament.seasonYear === 2026 &&
        blue.length === 3 &&
        red.length === 3 &&
        new Set([...blue, ...red]).size === 6
      ) {
        const user = await publicContext(2026, [...blue, ...red]);

        try {
          const result = await matchPredictionLogic(user, {
            blue1: blue[0]!,
            blue2: blue[1]!,
            blue3: blue[2]!,
            red1: red[0]!,
            red2: red[1]!,
            red3: red[2]!,
          });

          prediction = {
            blueWinning: result.blueWinning,
            redWinning: result.redWinning,
          };
        } catch (error) {
          if (error !== "not enough data") throw error;
        }
      }

      return { prediction, roles, coverage: scoutingCoverage(match.teamSlots) };
    });

    if (!analysis) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    res.set("Cache-Control", "public, max-age=60");
    res.json(analysis);
  } catch {
    res.status(503).json({ error: "Prediction unavailable" });
  }
}

// Match detail aggregates are requested separately so schedule cards stay light.
export async function getPublicMatchMetrics(
  req: Request,
  res: Response,
): Promise<void> {
  const key = req.params.key;

  if (
    typeof key !== "string" ||
    !/^\d{4}[a-z0-9]+_(?:qm\d+|(?:ef|qf|sf|f)\d+m\d+)$/.test(key)
  ) {
    res.status(400).json({ error: "Invalid match" });
    return;
  }

  try {
    const result = await publicCache(
      `scouting:match-metrics:v1:${key}`,
      async () => {
        const match = await prisma.match.findUnique({
          where: { key },
          select: {
            tournament: { select: { key: true, seasonYear: true } },
            teamSlots: {
              select: {
                key: true,
                teamNumber: true,
                alliance: true,
                _count: { select: { scoutReports: true } },
              },
            },
          },
        });

        if (!match) return null;
        if (match.tournament.seasonYear !== 2026) return { teams: [] };

        const slots = match.teamSlots.filter(
          (slot) => slot._count.scoutReports > 0,
        );
        if (!slots.length) return { teams: [] };

        const user: User = {
          id: "public-match-scouting:2026",
          email: "public@example.invalid",
          emailVerified: false,
          username: null,
          teamNumber: null,
          role: "ANALYST",
          teamSourceRule: { mode: "EXCLUDE", items: [] },
          tournamentSourceRule: {
            mode: "INCLUDE",
            items: [match.tournament.key],
          },
        };
        const metrics = [
          Metric.totalPoints,
          Metric.autoPoints,
          Metric.teleopPoints,
          Metric.totalFuelOutputted,
          Metric.totalBallsFed,
          Metric.totalDefenseTime,
        ];
        const values = await Promise.all(
          metrics.map((metric) =>
            arrayAndAverageTeams(user, {
              teams: slots.map((slot) => slot.teamNumber),
              metric,
            }),
          ),
        );

        const teams = slots.map((slot) => {
          const atMatch = (index: number): number | null =>
            values[index]?.[slot.teamNumber]?.timeLine?.find(
              (entry) => entry.match === slot.key,
            )?.dataPoint ?? null;

          return {
            teamNumber: slot.teamNumber,
            alliance: slot.alliance,
            reports: slot._count.scoutReports,
            points: atMatch(0),
            auto: atMatch(1),
            teleop: atMatch(2),
            fuelOutput: atMatch(3),
            fuelFed: atMatch(4),
            defenseSeconds: atMatch(5),
          };
        });

        return { teams };
      },
    );

    if (!result) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    res.set("Cache-Control", "public, max-age=60");
    res.json(result);
  } catch {
    res.status(503).json({ error: "Scouting metrics unavailable" });
  }
}

export async function getPublicTeamSeries(
  req: Request,
  res: Response,
): Promise<void> {
  const number = Number(req.params.number);
  const year = Number(req.params.year);

  if (
    !Number.isInteger(number) ||
    number <= 0 ||
    number > 2_147_483_647 ||
    !Number.isInteger(year) ||
    year < 1992 ||
    year > 9999
  ) {
    res.status(400).json({ error: "Invalid team or year" });
    return;
  }

  try {
    const matches = await publicCache(
      `scouting:team-series:v2:${number}:${year}`,
      async () => {
        if (year !== 2026) return [];

        const slots = await prisma.teamMatchData.findMany({
          where: {
            teamNumber: number,
            tournament: { seasonYear: year },
            scoutReports: { some: {} },
          },
          select: {
            key: true,
            matchKey: true,
            matchNumber: true,
            matchType: true,
            tournamentKey: true,
            tournament: { select: { name: true, startDate: true } },
            match: {
              select: {
                displayOrder: true,
                actualTime: true,
                scheduledTime: true,
                teamSlots: {
                  select: {
                    teamNumber: true,
                    alliance: true,
                    scoutReports: { select: { uuid: true } },
                  },
                },
              },
            },
            scoutReports: {
              select: { robotRoles: true, robotBrokeDescription: true },
            },
          },
        });

        if (!slots.length) return [];

        const user = await publicContext(year, [number]);
        const values = await Promise.all(
          [
            Metric.totalPoints,
            Metric.autoPoints,
            Metric.teleopPoints,
            Metric.totalBallsFed,
          ].map((metric) =>
            arrayAndAverageTeams(user, { teams: [number], metric }),
          ),
        );
        const timelines = values.map(
          (value) =>
            new Map(
              (value[number]?.timeLine ?? []).map((entry) => [
                entry.match,
                entry.dataPoint,
              ]),
            ),
        );

        const eventTime = (slot: (typeof slots)[number]) =>
          slot.tournament.startDate?.getTime() ?? 0;
        const matchTime = (slot: (typeof slots)[number]) =>
          (slot.match?.actualTime ?? slot.match?.scheduledTime)?.getTime() ?? 0;

        slots.sort(
          (a, b) =>
            eventTime(a) - eventTime(b) ||
            a.tournamentKey.localeCompare(b.tournamentKey) ||
            (a.matchType === b.matchType
              ? 0
              : a.matchType === "QUALIFICATION"
                ? -1
                : 1) ||
            (a.match?.displayOrder ?? a.matchNumber) -
              (b.match?.displayOrder ?? b.matchNumber) ||
            matchTime(a) - matchTime(b) ||
            a.key.localeCompare(b.key),
        );

        return slots.map((slot) => {
          const value = (index: number) => {
            const result = timelines[index]?.get(slot.key);
            return typeof result === "number" && Number.isFinite(result)
              ? result
              : null;
          };

          return {
            matchKey: slot.matchKey,
            elimination: slot.matchType !== "QUALIFICATION",
            reportedBroken: slot.scoutReports.some(
              (report) => !!report.robotBrokeDescription?.trim(),
            ),
            coverage: slot.match
              ? scoutingCoverage(slot.match.teamSlots ?? [])
              : null,
            eventKey: slot.tournamentKey,
            eventName: slot.tournament.name,
            label: `${slot.matchType === "QUALIFICATION" ? "Qualification" : "Elimination"} ${slot.matchNumber}`,
            points: value(0),
            auto: value(1),
            teleop: value(2),
            feeding: value(3),
            roles: mostCommonRoles(slot.scoutReports),
          };
        });
      },
    );

    res.set("Cache-Control", "public, max-age=60");
    res.json({ matches });
  } catch {
    res.status(503).json({ error: "Team analytics unavailable" });
  }
}

export async function getPublicDistrictLeaderboard(
  req: Request,
  res: Response,
): Promise<void> {
  const key = req.params.key;

  if (typeof key !== "string" || !/^\d{4}[a-z0-9]+$/.test(key)) {
    res.status(400).json({ error: "Invalid district" });
    return;
  }

  try {
    const leaderboard = await publicCache(
      `scouting:district:v1:${key}`,
      async () => {
        const district = await prisma.districtSeason.findUnique({
          where: { key },
          select: {
            seasonYear: true,
            teamSeasons: { select: { teamNumber: true, name: true } },
          },
        });

        if (!district) return null;
        if (district.seasonYear !== 2026) return [];

        const cohort = await seasonTeamMetrics(district.seasonYear);
        const members = new Map(
          district.teamSeasons.map((team) => [team.teamNumber, team.name]),
        );

        return cohort
          .filter((team) => members.has(team.number))
          .map((team) => ({
            ...team,
            name: members.get(team.number)!,
          }));
      },
    );

    if (leaderboard === null) {
      res.status(404).json({ error: "District not found" });
      return;
    }

    res.set("Cache-Control", "public, max-age=60");
    res.json({ teams: leaderboard });
  } catch {
    res.status(503).json({ error: "Leaderboard unavailable" });
  }
}

export async function getPublicPrediction(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.query.teams;
  const teams =
    typeof raw === "string" && /^\d+(,\d+){5}$/.test(raw)
      ? raw.split(",").map(Number)
      : [];

  if (
    teams.length !== 6 ||
    new Set(teams).size !== 6 ||
    teams.some(
      (team) => !Number.isInteger(team) || team <= 0 || team > 2_147_483_647,
    ) ||
    req.query.year !== "2026"
  ) {
    res.status(400).json({ error: "Choose six distinct teams in 2026" });
    return;
  }

  try {
    const prediction = await publicCache(
      `scouting:prediction:v1:2026:${teams.join(",")}`,
      async () => {
        const user = await publicContext(2026, teams);

        try {
          const result = await matchPredictionLogic(user, {
            blue1: teams[0]!,
            blue2: teams[1]!,
            blue3: teams[2]!,
            red1: teams[3]!,
            red2: teams[4]!,
            red3: teams[5]!,
          });
          return {
            blueWinning: result.blueWinning,
            redWinning: result.redWinning,
          };
        } catch (error) {
          if (error === "not enough data") return null;
          throw error;
        }
      },
    );

    res.set("Cache-Control", "public, max-age=60");
    res.json({ prediction });
  } catch {
    res.status(503).json({ error: "Prediction unavailable" });
  }
}

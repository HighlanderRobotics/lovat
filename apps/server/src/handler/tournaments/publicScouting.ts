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
      `scouting:team:${number}:${year}`,
      async () => {
        // Lovat's current scoring engine is for REBUILT; never apply it to older games.
        if (year !== 2026) return null;

        const user = await publicContext(year, [number]);
        const values = await Promise.all(
          [Metric.totalPoints, Metric.autoPoints, Metric.teleopPoints].map(
            (metric) => arrayAndAverageTeams(user, { teams: [number], metric }),
          ),
        );
        const total = values[0]![number];

        if (!total?.timeLine?.length) return null;

        return {
          matches: total.timeLine.length,
          points: total.average,
          auto: values[1]![number]?.average ?? 0,
          teleop: values[2]![number]?.average ?? 0,
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
    const analysis = await publicCache(`scouting:match:v2:${key}`, async () => {
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

      return { prediction, roles };
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

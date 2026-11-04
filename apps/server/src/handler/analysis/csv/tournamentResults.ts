import type { User } from "@lovat/db";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { analysisReadArgs } from "../analysisReadArgs.js";
import {
  accuracyToPercentage,
  autoEnd,
  endgameToPoints,
} from "../analysisConstants.js";
import {
  dataSourceRuleToPrismaFilter,
  dataSourceRuleSchema,
} from "../dataSourceRule.js";
import { readEstimatedScoreRows } from "../predictions/estimatedScoreRows.js";

const option = z.enum(["", "true", "false", "1", "0"]).optional();
export const exportQuery = z.object({
  tournamentKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  fixedPoints: option,
  winstreak: option,
  trend: option,
});
export const enabled = (value: unknown) =>
  value === "" || value === "true" || value === "1";
export function canExportTournament(user: User, key: string) {
  const rule = dataSourceRuleSchema(z.string()).parse(
    user.tournamentSourceRule,
  );
  return rule.mode === "INCLUDE"
    ? rule.items.includes(key)
    : !rule.items.includes(key);
}
export async function tournamentResults(
  user: User,
  key: string,
  includeEstimates = true,
) {
  if (!canExportTournament(user, key))
    throw Error("Tournament outside data sources");
  const matches = await prisma.match.findMany({
    where: { tournamentKey: key },
    include: {
      alliances: true,
      teamSlots: { select: { teamNumber: true, alliance: true } },
    },
    orderBy: [
      { displayOrder: "asc" },
      { competitionLevel: "asc" },
      { setNumber: "asc" },
      { matchNumber: "asc" },
    ],
  });
  matches.sort(
    (a, b) =>
      (a.displayOrder ??
        100000 +
          ({
            QUALIFICATION: 0,
            EIGHTHFINAL: 1,
            QUARTERFINAL: 2,
            SEMIFINAL: 3,
            FINAL: 4,
          }[a.competitionLevel] ?? 5) *
            10000 +
          a.setNumber * 100 +
          a.matchNumber) -
      (b.displayOrder ??
        100000 +
          ({
            QUALIFICATION: 0,
            EIGHTHFINAL: 1,
            QUARTERFINAL: 2,
            SEMIFINAL: 3,
            FINAL: 4,
          }[b.competitionLevel] ?? 5) *
            10000 +
          b.setNumber * 100 +
          b.matchNumber),
  );
  const teams = [
    ...new Set(matches.flatMap((m) => m.teamSlots.map((t) => t.teamNumber))),
  ].sort((a, b) => a - b);
  // Existing reader chooses one visible source scope per team/match; never sum scopes.
  const estimates = (
    includeEstimates ? await readEstimatedScoreRows(user, teams) : []
  ).filter((r) => r.tournamentKey === key);
  return { matches, teams, estimates };
}
export type TournamentResults = Awaited<ReturnType<typeof tournamentResults>>;
export function phasePoints(
  row: TournamentResults["estimates"][number],
  auto: boolean,
  teleop: boolean,
) {
  return auto && !teleop
    ? row.autoPoints
    : teleop && !auto
      ? row.teleopPoints
      : row.totalPoints;
}
export function ocrMatrix(
  data: TournamentResults,
  auto: boolean,
  teleop: boolean,
) {
  const byMatch = new Map(
    data.estimates.map((r) => [
      `${r.teamNumber}:${r.matchKey}`,
      phasePoints(r, auto, teleop),
    ]),
  );
  const columns = [
    "teamNumber",
    ...data.matches.map((m) =>
      m.key.split("_").slice(1).join("_").toUpperCase(),
    ),
  ];
  const rows = data.teams.map((team) => [
    team,
    ...data.matches.map((m) => byMatch.get(`${team}:${m.key}`) ?? null),
  ]);
  return { columns, rows };
}

/** Difference of the latest three match means and the preceding three. Missing
 * matches break the window; duplicate scout reports never count as matches. */
export function pointTrend(points: (number | null)[]): number | null {
  const window = points.slice(-6);
  if (window.length !== 6 || window.some((p) => p === null)) return null;
  return (
    (window.slice(3).reduce<number>((s, p) => s + p!, 0) -
      window.slice(0, 3).reduce<number>((s, p) => s + p!, 0)) /
    3
  );
}
export function currentWinStreak(
  results: ("WIN" | "LOSS" | "TIE" | "UNKNOWN")[],
): number | null {
  if (!results.length || results.at(-1) === "UNKNOWN") return null;
  let wins = 0;
  for (const result of [...results].reverse()) {
    if (result !== "WIN") break;
    wins++;
  }
  return wins;
}

export async function addResultColumns<
  T extends { teamNumber: number; match?: string },
>(
  rows: T[],
  user: User,
  query: Record<string, unknown>,
  includeAuto: boolean,
  includeTeleop: boolean,
  reportMatchKeys?: (string | null)[],
): Promise<T[]> {
  const fixed = enabled(query.fixedPoints),
    wins = enabled(query.winstreak),
    trend = enabled(query.trend);
  if (!fixed && !wins && !trend) return rows;
  const key = String(query.tournamentKey);
  const data = await tournamentResults(user, key, fixed);
  const rule = dataSourceRuleSchema(z.number()).parse(user.teamSourceRule);
  const filter = dataSourceRuleToPrismaFilter(rule);
  const reports = trend
    ? await prisma.scoutReport.findMany(
        analysisReadArgs("scoutReport", {
          where: {
            teamMatchData: {
              tournamentKey: key,
              matchType: { not: "PRACTICE" },
            },
            ...(filter ? { scouter: { sourceTeamNumber: filter } } : {}),
          },
          select: {
            accuracy: true,
            autoClimb: true,
            endgameClimb: true,
            teamMatchData: { select: { teamNumber: true, matchKey: true } },
            events: { select: { action: true, time: true, points: true } },
          },
        }),
      )
    : [];
  const groups = new Map<string, number[]>();
  for (const r of reports) {
    const events = r.events.filter((e) => e.action === "STOP_SCORING");
    const auto = events
      .filter((e) => e.time <= autoEnd)
      .reduce((s, e) => s + e.points, 0);
    const tele = events
      .filter((e) => e.time > autoEnd)
      .reduce((s, e) => s + e.points, 0);
    const accuracy =
      (r.accuracy == null ? 100 : (accuracyToPercentage[r.accuracy] ?? 100)) /
      100;
    const points =
      (includeAuto
        ? auto * accuracy + (r.autoClimb === "SUCCEEDED" ? 15 : 0)
        : 0) +
      (includeTeleop ? tele * accuracy : 0) +
      (includeAuto && includeTeleop ? endgameToPoints[r.endgameClimb] : 0);
    const id = `${r.teamMatchData.teamNumber}:${r.teamMatchData.matchKey}`;
    groups.set(id, [...(groups.get(id) ?? []), points]);
  }
  const mean = (values: number[]) =>
    values.length ? values.reduce((s, p) => s + p, 0) / values.length : null;
  return rows.map((row, index) => {
    let matches = data.matches.filter(
      (m) =>
        m.status === "COMPLETED" &&
        m.teamSlots.some((t) => t.teamNumber === row.teamNumber),
    );
    // Report exports describe the state through that match, not future matches.
    const current = row.match
      ? matches.find((m) => m.key === reportMatchKeys?.[index])
      : undefined;
    if (row.match && !current)
      return {
        ...row,
        ...(fixed ? { fixedPoints: null } : {}),
        ...(wins ? { winstreak: null } : {}),
        ...(trend ? { trend: null } : {}),
      };
    if (current) matches = matches.slice(0, matches.indexOf(current) + 1);
    const estimates = data.estimates.filter(
      (e) =>
        e.teamNumber === row.teamNumber &&
        (!current || e.matchKey === current.key),
    );
    const results = matches.map((m) => {
      const side = m.teamSlots.find(
        (t) => t.teamNumber === row.teamNumber,
      )!.alliance;
      if (m.winningAlliance)
        return m.winningAlliance === side
          ? ("WIN" as const)
          : ("LOSS" as const);
      const [a, b] = m.alliances;
      return a?.score != null && b?.score != null && a.score === b.score
        ? ("TIE" as const)
        : ("UNKNOWN" as const);
    });
    return {
      ...row,
      ...(fixed
        ? {
            fixedPoints: mean(
              estimates.map((e) => phasePoints(e, includeAuto, includeTeleop)),
            ),
          }
        : {}),
      ...(wins ? { winstreak: currentWinStreak(results) } : {}),
      ...(trend
        ? {
            trend: pointTrend(
              matches.map((m) =>
                mean(groups.get(`${row.teamNumber}:${m.key}`) ?? []),
              ),
            ),
          }
        : {}),
    };
  });
}

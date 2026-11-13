import type { PrismaClient } from "@lovat/db";
import type { AnalysisRequest } from "@lovat/api";
import type { AccessScope, AuthRepository } from "./auth.js";
import type { ReportInput } from "./metrics/facts.js";
import { HttpError } from "./errors.js";

export interface AnalysisRepository {
  loadReports(
    scope: AccessScope,
    request: AnalysisRequest,
    requires: ReadonlySet<string>,
  ): Promise<ReportInput[]>;
}
const filter = <T extends string | number>(rule: {
  mode: "INCLUDE" | "EXCLUDE";
  items: T[];
}) => (rule.mode === "INCLUDE" ? { in: rule.items } : { notIn: rule.items });

/** This is the only analysis database boundary; callers cannot supply their own source scope. */
export function createRepository(
  db: PrismaClient,
): AnalysisRepository & AuthRepository {
  return {
    userById: (id) =>
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          teamNumber: true,
          role: true,
          teamSourceRule: true,
          tournamentSourceRule: true,
          team: { select: { emailVerified: true } },
        },
      }),
    async loadReports(scope, request, requires) {
      const rows = await db.scoutReport.findMany({
        where: {
          training: false,
          reliability: { in: ["VERIFIED", "UNVERIFIED"] },
          scouter: { sourceTeamNumber: filter(scope.sources.teams) },
          teamMatchData: {
            teamNumber: { in: [...new Set(request.teams)] },
            matchType: { not: "PRACTICE" },
            tournamentKey: filter(scope.sources.tournaments),
            tournament: { seasonYear: request.season },
          },
        },
        select: {
          uuid: true,
          driverAbility: true,
          defenseEffectiveness: true,
          accuracy: true,
          autoClimb: true,
          endgameClimb: true,
          robotRoles: true,
          feederTypes: true,
          fieldTraversal: true,
          beached: true,
          scoresWhileMoving: true,
          disrupts: true,
          intakeType: true,
          teamMatchData: {
            select: {
              teamNumber: true,
              matchKey: true,
              key: true,
              tournamentKey: true,
              tournament: { select: { date: true } },
            },
          },
        },
        orderBy: { uuid: "asc" },
        take: 5001,
      });
      if (rows.length > 5000) {
        throw new HttpError(
          413,
          "ANALYSIS_TOO_LARGE",
          "Request fewer teams or narrower source tournaments",
        );
      }
      const events =
        requires.has("events") && rows.length
          ? await db.event.findMany({
              where: { scoutReportUuid: { in: rows.map((row) => row.uuid) } },
              select: {
                scoutReportUuid: true,
                action: true,
                position: true,
                time: true,
                quantity: true,
                points: true,
              },
              orderBy: [{ scoutReportUuid: "asc" }, { time: "asc" }],
              take: 100001,
            })
          : [];
      if (events.length > 100000) {
        throw new HttpError(
          413,
          "ANALYSIS_TOO_LARGE",
          "Request fewer teams or narrower source tournaments",
        );
      }
      const byReport = new Map<string, typeof events>();
      for (const event of events) {
        if (!byReport.has(event.scoutReportUuid)) {
          byReport.set(event.scoutReportUuid, []);
        }
        byReport.get(event.scoutReportUuid)!.push(event);
      }
      return rows.map((row) => ({
        ...row,
        events: byReport.get(row.uuid) ?? [],
        teamNumber: row.teamMatchData.teamNumber,
        matchKey: row.teamMatchData.key,
        tournamentKey: row.teamMatchData.tournamentKey,
        tournamentDate: row.teamMatchData.tournament.date ?? "0000-01-01",
      }));
    },
  };
}

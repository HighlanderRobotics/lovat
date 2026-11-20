import { compareReportGroups } from "@lovat/games";
import { boundedBatches } from "../batches.js";
import type { PrismaClient, Prisma } from "@lovat/db";
import type { AnalysisRequest } from "@lovat/api";
import type { AccessScope, AuthRepository } from "../auth.js";
import type { ReportInput } from "../metrics/facts.js";
import { HttpError } from "../errors.js";

export interface AnalysisRepository {
  streamReports(
    scope: AccessScope,
    request: AnalysisRequest,
    requires: ReadonlySet<string>,
  ): AsyncIterable<ReportInput>;
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
export function createLegacy2026Repository(
  db: PrismaClient,
): AnalysisRepository & AuthRepository {
  const repository: AnalysisRepository & AuthRepository = {
    async loadReports(scope, request, requires) {
      const reports: ReportInput[] = [];
      for await (const report of repository.streamReports(
        scope,
        request,
        requires,
      ))
        reports.push(report);
      return reports;
    },
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
    async *streamReports(scope, request, requires) {
      const scopedWhere: Prisma.ScoutReportWhereInput = {
        training: false,
        reliability: { in: ["VERIFIED", "UNVERIFIED"] },
        scouter: { sourceTeamNumber: filter(scope.sources.teams) },
        teamMatchData: {
          teamNumber: { in: [...new Set(request.teams)] },
          matchType: { not: "PRACTICE" },
          tournamentKey: filter(scope.sources.tournaments),
          tournament: { seasonYear: request.season },
        },
      };
      const rows = await db.scoutReport.findMany({
        where: scopedWhere,
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
      const reports = rows
        .map((row) => ({
          ...row,
          teamNumber: row.teamMatchData.teamNumber,
          matchKey: row.teamMatchData.key,
          tournamentKey: row.teamMatchData.tournamentKey,
          tournamentDate: row.teamMatchData.tournament.date ?? "0000-01-01",
        }))
        .sort(compareReportGroups);
      const counts =
        requires.has("events") && reports.length
          ? await db.event.groupBy({
              by: ["scoutReportUuid"],
              where: {
                scoutReportUuid: { in: reports.map((row) => row.uuid) },
              },
              _count: { _all: true },
            })
          : [];
      const countById = new Map(
        counts.map((row) => [row.scoutReportUuid, row._count._all]),
      );
      if (
        counts.reduce((sum, row) => sum + row._count._all, 0) > 100000 ||
        counts.some((row) => row._count._all > 10000)
      )
        throw new HttpError(
          413,
          "ANALYSIS_TOO_LARGE",
          "Request fewer teams or narrower source tournaments",
        );
      for (const batch of boundedBatches(
        reports,
        (row) => countById.get(row.uuid) ?? 0,
        1000,
        20000,
      )) {
        const expected = batch.reduce(
          (sum, row) => sum + (countById.get(row.uuid) ?? 0),
          0,
        );
        // Recheck visibility and fetch events in one short snapshot. This avoids
        // a costly relation join per event without racing tenant/reliability changes.
        const { events, visible } = await db.$transaction(
          async (tx) => {
            const current = await tx.scoutReport.findMany({
              where: {
                AND: [
                  scopedWhere,
                  { uuid: { in: batch.map((row) => row.uuid) } },
                ],
              },
              select: { uuid: true, teamMatchKey: true },
            });
            const expectedMatch = new Map(
              batch.map((row) => [row.uuid, row.matchKey]),
            );
            if (
              current.some(
                (row) => expectedMatch.get(row.uuid) !== row.teamMatchKey,
              )
            )
              throw new HttpError(
                409,
                "ANALYSIS_CHANGED",
                "Reports changed during analysis; retry shortly",
              );
            const visible = new Set(current.map((row) => row.uuid));
            const events =
              requires.has("events") && expected && visible.size
                ? await tx.event.findMany({
                    where: { scoutReportUuid: { in: [...visible] } },
                    select: {
                      scoutReportUuid: true,
                      action: true,
                      position: true,
                      time: true,
                      quantity: true,
                      points: true,
                    },
                    orderBy: [{ scoutReportUuid: "asc" }, { time: "asc" }],
                    take: expected + 1,
                  })
                : [];
            return { events, visible };
          },
          { isolationLevel: "RepeatableRead", timeout: 8000, maxWait: 5000 },
        );
        if (events.length > expected)
          throw new HttpError(
            409,
            "ANALYSIS_CHANGED",
            "Reports changed during analysis; retry shortly",
          );
        const byReport = new Map<string, typeof events>();
        for (const event of events) {
          if (!byReport.has(event.scoutReportUuid))
            byReport.set(event.scoutReportUuid, []);
          byReport.get(event.scoutReportUuid)!.push(event);
        }
        for (const row of batch)
          if (visible.has(row.uuid))
            yield { ...row, events: byReport.get(row.uuid) ?? [] };
      }
    },
  };
  return repository;
}

/** Bounded, source-scoped report data for exports and legacy analysis views. */
export async function loadDetailedReports(
  db: PrismaClient,
  scope: AccessScope,
  where: import("@lovat/db").Prisma.ScoutReportWhereInput = {},
  options: { text?: boolean; events?: boolean } = {},
) {
  const rows = await db.scoutReport.findMany({
    where: {
      AND: [
        where,
        {
          training: false,
          reliability: { in: ["VERIFIED", "UNVERIFIED"] },
          scouter: { sourceTeamNumber: filter(scope.sources.teams) },
          teamMatchData: {
            matchType: { not: "PRACTICE" },
            tournamentKey: filter(scope.sources.tournaments),
            tournament: { seasonYear: 2026 },
          },
        },
      ],
    },
    omit: { notes: true, robotBrokeDescription: true },
    include: {
      scouter: { select: { name: true, sourceTeamNumber: true } },
      teamMatchData: { include: { tournament: true } },
    },
    orderBy: { uuid: "asc" },
    take: 5001,
  });
  if (rows.length > 5000)
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Narrow your team or tournament selection",
    );
  const sizes =
    options.text && rows.length
      ? await db.$queryRaw<
          { bytes: bigint }[]
        >`SELECT COALESCE(sum(octet_length("notes")+COALESCE(octet_length("robotBrokeDescription"),0)),0) AS bytes FROM "ScoutReport" WHERE uuid=ANY(${rows.map((r) => r.uuid)}::text[])`
      : [];
  if (Number(sizes[0]?.bytes ?? 0) > 4 * 1024 * 1024)
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Narrow your team or tournament selection",
    );
  const notes =
    options.text && rows.length
      ? await db.scoutReport.findMany({
          where: { uuid: { in: rows.map((r) => r.uuid) } },
          select: { uuid: true, notes: true, robotBrokeDescription: true },
        })
      : [];
  const textById = new Map(notes.map((r) => [r.uuid, r]));
  const events =
    options.events !== false && rows.length
      ? await db.event.findMany({
          where: { scoutReportUuid: { in: rows.map((r) => r.uuid) } },
          orderBy: [{ time: "asc" }, { eventUuid: "asc" }],
          take: 100001,
        })
      : [];
  if (events.length > 100000)
    throw new HttpError(
      413,
      "ANALYSIS_TOO_LARGE",
      "Narrow your team or tournament selection",
    );
  const byReport = new Map<string, typeof events>();
  for (const event of events) {
    if (!byReport.has(event.scoutReportUuid))
      byReport.set(event.scoutReportUuid, []);
    byReport.get(event.scoutReportUuid)!.push(event);
  }
  return rows.map((row) => ({
    ...row,
    notes: textById.get(row.uuid)?.notes ?? "",
    robotBrokeDescription:
      textById.get(row.uuid)?.robotBrokeDescription ?? null,
    events: byReport.get(row.uuid) ?? [],
  }));
}

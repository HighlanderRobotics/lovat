import { randomUUID } from "node:crypto";
import { boundedText } from "./service";
import { analysisEventAllowed } from "./event-control";
import { z } from "zod";
import {
  EventAction,
  Position,
  RobotRole,
  AutoClimb,
  EndgameClimb,
  Beached,
  FieldTraversal,
  IntakeType,
  FeederType,
  ClimbPosition,
  ClimbSide,
  type PrismaClient,
} from "@lovat/db";
const sourceEvent = z
  .object({
    eventUuid: z.string().uuid(),
    analysisExcluded: z.boolean(),
    time: z.number().finite().nonnegative(),
    action: z.nativeEnum(EventAction),
    position: z.nativeEnum(Position),
    points: z.number().int(),
    quantity: z.number().int().nullable(),
  })
  .strict();
export const sourceReportSchema = z
  .object({
    uuid: z.string().uuid(),
    analysisExcluded: z.boolean(),
    scouterUuid: z.string().uuid(),
    sourceTeamNumber: z.number().int().positive(),
    matchKey: z.string().min(1).nullable(),
    teamNumber: z.number().int().positive(),
    matchType: z.enum(["QUALIFICATION", "ELIMINATION"]),
    matchNumber: z.number().int().positive(),
    startTime: z.coerce.date(),
    robotRoles: z.array(z.nativeEnum(RobotRole)),
    driverAbility: z.number().int(),
    accuracy: z.number().int().nullable(),
    beached: z.nativeEnum(Beached),
    climbPosition: z.nativeEnum(ClimbPosition).nullable(),
    climbSide: z.nativeEnum(ClimbSide).nullable(),
    defenseEffectiveness: z.number().int(),
    feederTypes: z.array(z.nativeEnum(FeederType)),
    intakeType: z.nativeEnum(IntakeType),
    fieldTraversal: z.nativeEnum(FieldTraversal),
    scoresWhileMoving: z.boolean(),
    disrupts: z.boolean(),
    endgameClimb: z.nativeEnum(EndgameClimb),
    autoClimb: z.nativeEnum(AutoClimb),
    events: z.array(sourceEvent).max(2000),
  })
  .strict();
type SourceReport = z.infer<typeof sourceReportSchema>;
const pageSchema = z
  .object({
    eventKey: z.string(),
    reports: z.array(sourceReportSchema).max(250),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export async function readSourceReports(
  eventKey: string,
  fetcher: typeof fetch = fetch,
): Promise<SourceReport[]> {
  if (!analysisEventAllowed(eventKey)) throw Error("Event is not enabled");
  const configured = process.env.OCR_REPORT_SOURCE_URL,
    token = process.env.OCR_REPORT_SOURCE_TOKEN;
  if (!configured || !token || token.length < 32)
    throw Error("Report source is not configured");
  const base = new URL(configured);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error("Invalid report source configuration");
  const rows: SourceReport[] = [],
    seen = new Set<string>();
  let after = "";
  for (let page = 0; page < 80; page++) {
    const url = new URL(`/reports/${eventKey}`, base);
    if (after) url.searchParams.set("after", after);
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!response.ok) throw Error("Report source unavailable");
    const text = await boundedText(response, 16 * 1024 * 1024);
    const data = pageSchema.parse(JSON.parse(text));
    if (data.eventKey !== eventKey) throw Error("Cross-event source response");
    for (const r of data.reports) {
      if (
        (r.matchKey !== null && !r.matchKey.startsWith(eventKey + "_")) ||
        seen.has(r.uuid) ||
        r.uuid <= after
      )
        throw Error("Conflicting report source identity");
      seen.add(r.uuid);
      rows.push(r);
    }
    if (!data.nextCursor) return rows;
    if (
      data.nextCursor <= after ||
      data.nextCursor !== data.reports.at(-1)?.uuid
    )
      throw Error("Invalid report source cursor");
    after = data.nextCursor;
  }
  throw Error("Report source exceeds event budget");
}
/** Additive, idempotent copy of required numeric/categorical observations.
 * Never replace preview notes, exclusions, credentials, accounts or source rows. */
export async function importSourceReports(
  db: PrismaClient,
  eventKey: string,
  reports: SourceReport[],
) {
  const ownersByScout = new Map<string, number>();
  const identities = new Set<string>();
  for (const report of reports) {
    const owner = ownersByScout.get(report.scouterUuid);
    if (
      (owner !== undefined && owner !== report.sourceTeamNumber) ||
      identities.has(report.uuid)
    )
      throw Error("Conflicting source report identity");
    ownersByScout.set(report.scouterUuid, report.sourceTeamNumber);
    identities.add(report.uuid);
  }
  const slots = await db.teamMatchData.findMany({
    where: { tournamentKey: eventKey },
    select: {
      key: true,
      matchKey: true,
      teamNumber: true,
      matchType: true,
      matchNumber: true,
    },
  });
  const slotMap = new Map(
    slots.map((s) => [`${s.matchKey}:${s.teamNumber}`, s.key]),
  );
  const identityMap = new Map(
    slots.map((s) => [
      `${s.matchType}:${s.matchNumber}:${s.teamNumber}`,
      s.key,
    ]),
  );
  const reportSlot = (r: SourceReport) =>
    r.matchKey
      ? slotMap.get(`${r.matchKey}:${r.teamNumber}`)
      : identityMap.get(`${r.matchType}:${r.matchNumber}:${r.teamNumber}`);
  let imported = 0;
  for (let i = 0; i < reports.length; i += 100) {
    const batch = reports.slice(i, i + 100);
    await db.$transaction(
      async (tx) => {
        const sources = [...new Set(batch.map((r) => r.sourceTeamNumber))];
        await tx.team.createMany({
          data: sources.map((number) => ({ number, name: `Team ${number}` })),
          skipDuplicates: true,
        });
        await tx.registeredTeam.createMany({
          data: sources.map((number) => ({
            number,
            code: randomUUID(),
            email: `ocr-source-${number}@example.invalid`,
          })),
          skipDuplicates: true,
        });
        const scouts = [
          ...new Map(
            batch.map((r) => [
              r.scouterUuid,
              {
                uuid: r.scouterUuid,
                sourceTeamNumber: r.sourceTeamNumber,
                name: `Source team ${r.sourceTeamNumber} scout`,
              },
            ]),
          ).values(),
        ];
        await tx.scouter.createMany({ data: scouts, skipDuplicates: true });
        const owners = await tx.scouter.findMany({
          where: { uuid: { in: scouts.map((s) => s.uuid) } },
          select: { uuid: true, sourceTeamNumber: true },
        });
        if (
          owners.some(
            (s) =>
              scouts.find((x) => x.uuid === s.uuid)!.sourceTeamNumber !==
              s.sourceTeamNumber,
          )
        )
          throw Error("Source scout ownership conflict");
        const existing = await tx.scoutReport.findMany({
          where: { uuid: { in: batch.map((r) => r.uuid) } },
          include: { events: true },
        });
        for (const r of batch) {
          const slot = reportSlot(r);
          if (!slot) throw Error("Source report has no canonical match slot");
          const old = existing.find((x) => x.uuid === r.uuid);
          if (
            old &&
            (old.scouterUuid !== r.scouterUuid || old.teamMatchKey !== slot)
          )
            throw Error("Source report ownership conflict");
          if (old) {
            const {
              analysisExcluded: _excluded,
              sourceTeamNumber: _source,
              matchKey: _match,
              teamNumber: _team,
              matchType: _type,
              matchNumber: _number,
              ...expected
            } = r;
            const eventProjection = (rows: typeof r.events) =>
              rows
                .map(
                  ({
                    eventUuid,
                    time,
                    action,
                    position,
                    points,
                    quantity,
                  }) => ({
                    eventUuid,
                    time,
                    action,
                    position,
                    points,
                    quantity,
                  }),
                )
                .sort((a, b) => a.eventUuid.localeCompare(b.eventUuid));
            const current = Object.fromEntries(
              Object.keys(expected).map((k) => [
                k,
                k === "events"
                  ? eventProjection(old.events)
                  : (old as unknown as Record<string, unknown>)[k],
              ]),
            );
            if (
              JSON.stringify(current) !==
              JSON.stringify({
                ...expected,
                events: eventProjection(expected.events),
              })
            )
              throw Error(
                "Source report differs from an existing preview report",
              );
          }
        }
        // Source exclusions are monotonic: never re-enable evidence excluded
        // by either the source team or preview reviewers.
        await tx.scoutReport.updateMany({
          where: {
            uuid: {
              in: batch.filter((r) => r.analysisExcluded).map((r) => r.uuid),
            },
            analysisExcluded: false,
          },
          data: { analysisExcluded: true },
        });
        await tx.event.updateMany({
          where: {
            eventUuid: {
              in: batch.flatMap((r) =>
                r.events
                  .filter((e) => e.analysisExcluded)
                  .map((e) => e.eventUuid),
              ),
            },
            analysisExcluded: false,
          },
          data: { analysisExcluded: true },
        });
        const fresh = batch.filter(
          (r) => !existing.some((x) => x.uuid === r.uuid),
        );
        if (!fresh.length) return;
        await tx.scoutReport.createMany({
          data: fresh.map((r) => {
            const {
              sourceTeamNumber: _source,
              matchKey,
              teamNumber,
              matchType: _type,
              matchNumber: _number,
              events: _events,
              ...fields
            } = r;
            return {
              ...fields,
              teamMatchKey: reportSlot(r)!,
              notes: "",
              robotBrokeDescription: null,
            };
          }),
          skipDuplicates: false,
        });
        const events = fresh.flatMap((r) =>
          r.events.map((e) => ({ ...e, scoutReportUuid: r.uuid })),
        );
        for (let j = 0; j < events.length; j += 1000)
          await tx.event.createMany({ data: events.slice(j, j + 1000) });
        imported += fresh.length;
      },
      { timeout: 30000 },
    );
  }
  return { sourceReports: reports.length, imported };
}

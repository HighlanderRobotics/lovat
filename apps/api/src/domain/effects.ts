import type { Prisma } from "@lovat/db";
import { effectSchema, type Effect } from "@lovat/api/effects";

export async function enqueue(
  tx: Prisma.TransactionClient,
  dedupeKey: string,
  effect: Effect,
) {
  const payload = effectSchema.parse(effect);
  await tx.apiOutbox.upsert({
    where: { dedupeKey },
    update: {},
    create: { dedupeKey, kind: effect.kind, payload },
  });
}
export async function recordAnalysisChange(
  tx: Prisma.TransactionClient,
  teamNumber: number,
) {
  const row = await tx.analysisRevision.upsert({
    where: { teamNumber },
    create: { teamNumber, revision: 1n },
    update: { revision: { increment: 1n } },
  });
  await enqueue(tx, "analysis:" + teamNumber + ":" + row.revision, {
    kind: "cache.revision",
    teamNumber,
    revision: row.revision.toString(),
  });
}
export async function reportEffects(
  tx: Prisma.TransactionClient,
  report: {
    uuid: string;
    teamNumber: number;
    robotBrokeDescription?: string | null;
  },
  sourceTeamNumber: number,
) {
  await recordAnalysisChange(tx, report.teamNumber);
  if (report.robotBrokeDescription?.trim())
    await enqueue(tx, "break:" + report.uuid, {
      kind: "slack.warning",
      reportUuid: report.uuid,
      sourceTeamNumber,
    });
}

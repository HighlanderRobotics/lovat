import type { PrismaClient } from "@lovat/db";

export async function runMaintenance(db: PrismaClient, now = new Date()) {
  await db.emailVerificationRequest.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  await db.registeredTeam.deleteMany({
    where: {
      timeCreated: { lt: new Date(now.getTime() - 86_400_000) },
      emailVerified: false,
    },
  });
  await db.scoutReportInProgress.updateMany({
    where: {
      status: { in: ["LOADED", "STARTED", "ENDED"] },
      expiresAt: { lte: now },
    },
    data: { status: "ABANDONED" },
  });
  await db.scoutReportInProgress.updateMany({
    where: {
      status: "ABANDONED",
      expiresAt: { lte: new Date(now.getTime() - 23 * 86_400_000) },
      NOT: { payload: { equals: {} } },
    },
    data: { payload: {} },
  });
}

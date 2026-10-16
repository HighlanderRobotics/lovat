import prisma from "../prismaClient.js";

export default async function expireReportsInProgress(
  now = new Date(),
): Promise<void> {
  await prisma.scoutReportInProgress.updateMany({
    where: {
      status: { in: ["LOADED", "STARTED", "ENDED"] },
      expiresAt: { lte: now },
    },
    data: { status: "ABANDONED" },
  });
  // expiresAt is seven days after the last lifecycle update; scrub at day thirty.
  await prisma.scoutReportInProgress.updateMany({
    where: {
      status: "ABANDONED",
      expiresAt: { lte: new Date(now.getTime() - 23 * 86_400_000) },
      NOT: { payload: { equals: {} } },
    },
    data: { payload: {} },
  });
}

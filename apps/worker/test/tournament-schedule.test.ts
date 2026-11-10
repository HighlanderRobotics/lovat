import { expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { reconcileSchedule } from "../src/scheduler";

for (const timestamp of ["2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z"]) {
  test(`automatically queues only the current UTC tournament season at ${timestamp}`, async () => {
    const now = new Date(timestamp);
    const queued: { kind: string; targetKey: string; runAt: Date }[] = [];
    const db = {
      districtSeason: { findMany: async () => [] },
      tournament: { findMany: async () => [] },
      importJob: {
        findMany: async () => [],
        upsert: async ({ create }: { create: (typeof queued)[number] }) => {
          queued.push(create);
          return create;
        },
      },
    } as unknown as PrismaClient;

    await reconcileSchedule(db, now);

    expect(queued.filter((job) => job.kind === "tournaments")).toEqual([
      {
        kind: "tournaments",
        targetKey: String(now.getUTCFullYear()),
        runAt: now,
      },
    ]);
  });
}

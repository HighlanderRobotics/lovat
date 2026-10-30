import { beforeAll, afterAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import {
  enqueueEventAnalysis,
  eventAnalysisKind,
  eventAnalysisStatus,
} from "../src/ocr/event-control";
const enabled = process.env.LOVAT_DB_TEST === "1",
  run = enabled ? test : test.skip;
const eventKey = `2026control${crypto.randomUUID().replaceAll("-", "")}`;
const priorEvents = process.env.OCR_ANALYSIS_EVENT_KEYS;
let db: PrismaClient;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  )
    throw Error("Use disposable local lovat_test only");
  const { createDb } = await import("@lovat/db");
  db = createDb(url.href);
  process.env.OCR_ANALYSIS_EVENT_KEYS = eventKey;
});
afterAll(async () => {
  if (priorEvents === undefined) delete process.env.OCR_ANALYSIS_EVENT_KEYS;
  else process.env.OCR_ANALYSIS_EVENT_KEYS = priorEvents;
  if (!enabled || !db) return;
  await db.importJob.deleteMany({
    where: { kind: eventAnalysisKind, targetKey: eventKey },
  });
  await db.$disconnect();
});
run(
  "repeated requests keep an active lease intact and requeue only after expiry",
  async () => {
    const first = await enqueueEventAnalysis(db, eventKey);
    const where = {
      kind_targetKey: { kind: eventAnalysisKind, targetKey: eventKey },
    };
    const future = new Date(Date.now() + 60000);
    await db.importJob.update({
      where,
      data: {
        leaseToken: "synthetic-owner",
        leaseExpiresAt: future,
        attempts: 3,
        lastError: "SyntheticRetry",
      },
    });
    const second = await enqueueEventAnalysis(db, eventKey);
    expect(second.jobId).toBe(first.jobId);
    const active = await db.importJob.findUniqueOrThrow({ where });
    expect(active.leaseToken).toBe("synthetic-owner");
    expect(active.attempts).toBe(3);
    expect((await eventAnalysisStatus(db, eventKey)).status).toBe("RUNNING");
    await db.importJob.update({ where, data: { leaseExpiresAt: new Date(0) } });
    await enqueueEventAnalysis(db, eventKey);
    const resumed = await db.importJob.findUniqueOrThrow({ where });
    expect(resumed.attempts).toBe(0);
    expect(resumed.lastError).toBeNull();
    expect((await eventAnalysisStatus(db, eventKey)).status).toBe("QUEUED");
    await db.importJob.update({
      where,
      data: { leaseToken: null, leaseExpiresAt: null, runAt: future },
    });
    const empty = await eventAnalysisStatus(db, eventKey);
    expect(empty.status).toBe("PARTIAL");
    expect(empty.warnings).toEqual(["NO_SCOUT_REPORTS", "NO_ESTIMATES"]);
  },
);

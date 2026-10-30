import { afterAll, expect, test } from "bun:test";
import { Prisma, type PrismaClient } from "@lovat/db";
import { z } from "zod";
import { runEventAnalysis } from "../src/ocr/event-analysis";
import { createTbaClient } from "../src/providers/tba";
import { OcrProviderBlocked } from "../src/ocr/commandFailure";
import { OcrServiceUnavailable } from "../src/ocr/service";
import { sourceFixture } from "./fixtures/report-source";
import configuredTemplate from "../config/scoreboard-2026-calgames.json";
import { templateSchema } from "../src/ocr/media";
const template = templateSchema.parse(configuredTemplate);
const savedEnvironment = process.env.RAILWAY_ENVIRONMENT_ID;
const savedConcurrency = process.env.OCR_EVENT_CONCURRENCY;
const savedUrl = process.env.OCR_SERVICE_URL,
  savedToken = process.env.OCR_SERVICE_TOKEN;
afterAll(() => {
  if (savedConcurrency === undefined) delete process.env.OCR_EVENT_CONCURRENCY;
  else process.env.OCR_EVENT_CONCURRENCY = savedConcurrency;
  if (savedEnvironment === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
  else process.env.RAILWAY_ENVIRONMENT_ID = savedEnvironment;
  if (savedUrl === undefined) delete process.env.OCR_SERVICE_URL;
  else process.env.OCR_SERVICE_URL = savedUrl;
  if (savedToken === undefined) delete process.env.OCR_SERVICE_TOKEN;
  else process.env.OCR_SERVICE_TOKEN = savedToken;
});
function harness(
  options: {
    prior?: boolean;
    noVideo?: boolean;
    noReports?: boolean;
    roster?: number;
  } = {},
) {
  process.env.OCR_EVENT_CONCURRENCY = "1";
  process.env.RAILWAY_ENVIRONMENT_ID = "51f783a8-01c1-4d64-ad5b-11ac94d54c17";
  process.env.OCR_SERVICE_URL = "http://synthetic.railway.internal";
  process.env.OCR_SERVICE_TOKEN = "synthetic-token-".repeat(3);
  const stages: string[] = [],
    writes: any[] = [];
  const matches = [1, 2].map((n) => ({
    key: `2026casnf_qm${n}`,
    competitionLevel: "QUALIFICATION",
    matchNumber: n,
    teamSlots: Array.from({ length: options.roster ?? 6 }, (_, i) => ({
      teamNumber: i + 1,
    })),
    scoreboardOcr: options.prior
      ? { status: "PARTIAL", templateVersion: template.version }
      : null,
  }));
  const db = {
    season: { upsert: async () => {} },
    tournament: { upsert: async () => {} },
    scouter: {
      findMany: async () =>
        options.noReports ? [] : [{ sourceTeamNumber: 8033 }],
    },
    match: { findMany: async () => matches },
    scoreboardOcr: {
      upsert: async (write: unknown) => {
        writes.push(write);
        stages.push("checkpoint");
      },
    },
  } as unknown as PrismaClient;
  const tba = {
    get: async <T>(path: string, schema: z.ZodType<T>) => ({
      modified: true,
      etag: null,
      lastModified: null,
      data: schema.parse(
        path.startsWith("event/")
          ? {
              key: "2026casnf",
              year: 2026,
              name: "Synthetic event",
              city: null,
              start_date: "2026-03-01",
              end_date: "2026-03-02",
              timezone: null,
              event_type: 0,
              week: 1,
              playoff_type: 10,
              parent_event_key: null,
              district: null,
            }
          : {
              videos: options.noVideo
                ? []
                : [
                    { type: "youtube", key: "abcdefghijk" },
                    { type: "youtube", key: "lmnopqrstuv" },
                  ],
            },
      ),
    }),
  } as unknown as ReturnType<typeof createTbaClient>;
  const evidence = {
    observations: Array.from({ length: 164 }, (_, time) => ({
      time,
      red: time,
      blue: time,
      confidence: 95,
    })),
    channels: { red: [{ time: 1, count: 1, confidence: 95 }], blue: [] },
    layoutVersion: template.version,
    frames: 164,
    elapsedMs: 1,
  };
  const deps = {
    reportSourceConfigured: () => true,
    createTbaClient: () => tba,
    importMatches: async () => {
      stages.push("canonical");
    },
    readSourceReports: async () => {
      stages.push("read-source");
      return options.noReports ? [] : [sourceFixture()];
    },
    importSourceReports: async () => {
      stages.push("import-source");
      return {
        sourceReports: options.noReports ? 0 : 1,
        imported: options.noReports ? 0 : 1,
      };
    },
    eventTemplate: () => template,
    withEventVideo: async <T>(
      _event: string,
      _video: string,
      action: (path: string) => Promise<T>,
    ) => action("synthetic-only"),
    extractServiceEvidence: async () => {
      stages.push("extract");
      return evidence;
    },
    refreshMatchEstimates: async () => {
      stages.push("refresh");
      return 6;
    },
    hasCachedVideo: async () => false,
  };
  return { db, deps, evidence, stages, writes };
}
test("event run imports before OCR and checkpoints evidence before rebuilding estimates", async () => {
  const h = harness();
  await runEventAnalysis("2026casnf", h.db, h.deps);
  expect(h.stages).toEqual([
    "canonical",
    "read-source",
    "import-source",
    "extract",
    "checkpoint",
    "refresh",
    "extract",
    "checkpoint",
    "refresh",
  ]);
  expect(h.writes[0].create.status).toBe("VALIDATED");
  expect(h.writes[0].create.channels).toEqual(h.evidence.channels);
});
test("retry reuses accepted evidence and refreshes estimates using current reports", async () => {
  const h = harness({ prior: true });
  await runEventAnalysis("2026casnf", h.db, h.deps);
  expect(h.stages.filter((s) => s === "refresh")).toHaveLength(2);
  expect(h.stages).not.toContain("extract");
  expect(h.writes).toHaveLength(0);
});
test("failed video candidates clear observations and channels rather than mixing provenance", async () => {
  const h = harness();
  let calls = 0;
  h.deps.extractServiceEvidence = async () => {
    if (++calls % 2 === 0) throw Error("secret upstream diagnostic");
    return { ...h.evidence, observations: h.evidence.observations.slice(0, 1) };
  };
  await runEventAnalysis("2026casnf", h.db, h.deps);
  for (const w of h.writes) {
    expect(w.create.status).toBe("REJECTED");
    expect(w.create.videoKey).toBe("lmnopqrstuv");
    expect(w.create.observations).toEqual([]);
    expect(w.create.channels).toEqual(Prisma.DbNull);
    expect(w.create.reason).not.toContain("secret");
  }
});
test("provider blocking opens a circuit for uncached videos and records retryable outcomes", async () => {
  const h = harness();
  let attempts = 0;
  h.deps.withEventVideo = async () => {
    attempts++;
    throw new OcrProviderBlocked("The video provider blocked the download.");
  };
  await expect(
    runEventAnalysis("2026casnf", h.db, h.deps),
  ).rejects.toBeInstanceOf(OcrProviderBlocked);
  expect(attempts).toBe(1);
  expect(h.writes.every((w) => w.create.status === "MEDIA_BLOCKED")).toBe(true);
  expect(h.stages).not.toContain("extract");
});
test("transient native outages propagate without storing a permanent match rejection", async () => {
  const h = harness();
  h.deps.extractServiceEvidence = async () => {
    throw new OcrServiceUnavailable("retry");
  };
  await expect(
    runEventAnalysis("2026casnf", h.db, h.deps),
  ).rejects.toBeInstanceOf(OcrServiceUnavailable);
  expect(h.writes).toHaveLength(0);
});
test("missing video and invalid rosters remain visible without invoking extraction", async () => {
  for (const options of [{ noVideo: true }, { roster: 5 }]) {
    const h = harness(options);
    await runEventAnalysis("2026casnf", h.db, h.deps);
    expect(h.stages).not.toContain("extract");
    expect(h.writes[0].create.status).toBe(
      options.noVideo ? "NO_VIDEO" : "INVALID_ROSTER",
    );
  }
});

test("bounded two-match execution never exceeds native capacity", async () => {
  const h = harness();
  process.env.OCR_EVENT_CONCURRENCY = "2";
  let active = 0,
    peak = 0;
  h.deps.extractServiceEvidence = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return h.evidence;
  };
  await runEventAnalysis("2026casnf", h.db, h.deps);
  expect(peak).toBe(2);
  expect(active).toBe(0);
  expect(h.writes).toHaveLength(2);
});
test("losing job ownership drains work without writing stale checkpoints", async () => {
  const h = harness(),
    owner = new AbortController();
  h.deps.extractServiceEvidence = async () => {
    owner.abort();
    return h.evidence;
  };
  await expect(
    runEventAnalysis("2026casnf", h.db, h.deps, owner.signal),
  ).rejects.toThrow();
  expect(h.writes).toHaveLength(0);
  expect(h.stages).not.toContain("refresh");
});

test("existing preview reports can be analyzed without a production source service", async () => {
  const h = harness();
  h.deps.reportSourceConfigured = () => false;
  await runEventAnalysis("2026casnf", h.db, h.deps);
  expect(h.stages).not.toContain("read-source");
  expect(h.stages).not.toContain("import-source");
  expect(h.writes).toHaveLength(2);
});

test("unreviewed broadcast crops cannot publish validated scores", async () => {
  const h = harness();
  await runEventAnalysis("2026casnf", h.db, {
    ...h.deps,
    templateReviewed: () => false,
  });
  expect(h.writes).toHaveLength(2);
  expect(
    h.writes.every((w) => w.create.status === "PROFILE_REVIEW_REQUIRED"),
  ).toBe(true);
  expect(h.stages.filter((s) => s === "refresh")).toHaveLength(2);
});

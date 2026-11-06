import { z } from "zod";

const label = z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  count = z.number().int().min(0).max(100000000),
  duration = z.number().finite().min(0).max(86400000);
export const context = { service: label, environment: label };
export const syncEvent = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  ...context,
  installationId: z.uuid(),
  attemptId: label,
  event: z.enum([
    "sync_queued",
    "sync_started",
    "sync_batch_attempted",
    "sync_batch_succeeded",
    "sync_batch_failed",
    "sync_retry_scheduled",
    "sync_conflict_detected",
    "sync_completed",
    "sync_queue_state",
    "sync_storage_error",
  ]),
  appVersion: label,
  build: label.optional(),
  platform: z.enum(["ios", "android", "web"]),
  queueDepth: count,
  batchRecords: count.optional(),
  retryCount: count.default(0),
  latencyMs: duration.optional(),
  errorCode: label.optional(),
  networkState: z.enum(["online", "offline", "unknown"]).optional(),
  oldestItemAgeMs: z.number().min(0).max(31536000000).optional(),
});
export const jobEvent = z.object({
  id: z.uuid(),
  ...context,
  jobId: label,
  kind: label,
  queue: label,
  attempt: z.number().int().min(1).max(100),
  outcome: z.enum(["queued", "running", "success", "failed", "cancelled"]),
  enqueuedAt: z.iso.datetime().optional(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  durationMs: duration.optional(),
  errorFingerprint: label.optional(),
  deploymentId: label.optional(),
  traceId: label.optional(),
});
export const qualityEvent = z
  .object({
    id: z.uuid(),
    ...context,
    rule: label,
    source: label,
    status: z.enum(["passed", "failed", "unavailable"]),
    checkedRecords: count,
    affectedRecords: count,
    severity: z.enum(["SEV1", "SEV2", "SEV3"]),
    checkedAt: z.iso.datetime(),
  })
  .refine(
    (v) => v.affectedRecords <= v.checkedRecords,
    "Affected records exceed checked records",
  );
export const contactEvent = z.object({
  id: z.uuid(),
  ...context,
  installationId: z.uuid(),
  appVersion: label,
  build: label.optional(),
  platform: z.enum(["ios", "android", "web"]),
  osVersion: label.optional(),
  contactedAt: z.iso.datetime(),
});
export const configEvent = z.object({
  id: z.uuid(),
  ...context,
  revision: label,
  runtime: label,
  keysPresent: z.array(label).max(200),
  publicValues: z.record(
    z.enum([
      "runtimeVersion",
      "region",
      "replicas",
      "telemetryEnabled",
      "targetSdk",
      "minimumVersion",
    ]),
    z.union([z.string().max(100), z.number(), z.boolean()]),
  ),
  createdAt: z.iso.datetime(),
});
export const flagEvent = z
  .object({
    id: z.uuid(),
    ...context,
    flag: label,
    variant: label,
    appVersion: label,
    requests: count,
    errors: count,
    durationSumMs: z.number().finite().nonnegative(),
    observedAt: z.iso.datetime(),
  })
  .refine((v) => v.errors <= v.requests, "Errors exceed requests");
export const costInput = z
  .object({
    id: z.uuid(),
    ...context,
    provider: label,
    amount: z.number().nonnegative().finite(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    kind: z.enum(["provider-reported", "estimate"]),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    assumptions: z.string().max(1000).optional(),
    observedAt: z.iso.datetime(),
  })
  .refine(
    (v) => Date.parse(v.periodEnd) > Date.parse(v.periodStart),
    "Invalid cost period",
  )
  .refine(
    (v) => v.kind !== "estimate" || Boolean(v.assumptions),
    "Estimates require assumptions",
  );
export const sloInput = z
  .object({
    ...context,
    name: z.string().min(3).max(120),
    kind: z.enum(["availability", "latency", "sync", "synthetic", "jobs"]),
    target: z.number().min(90).max(99.9999),
    latencyMs: duration.optional(),
    windowDays: z.number().int().min(1).max(30).default(7),
    minSamples: z.number().int().min(1).default(100),
  })
  .refine(
    (v) => v.kind !== "latency" || v.latencyMs !== undefined,
    "Latency SLO requires an ms threshold",
  );
export const syntheticInput = z.object({
  ...context,
  name: z.string().min(3).max(120),
  url: z.url().max(1000),
  expectedStatus: z.number().int().min(200).max(499).default(200),
  intervalSeconds: z.number().int().min(60).max(86400).default(300),
  critical: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export const runbookInput = z.object({
  ...context,
  title: z.string().min(3).max(200),
  owner: label,
  trigger: z.string().min(1).max(500),
  body: z.string().min(10).max(30000),
  reviewedAt: z.iso.datetime().nullable().optional(),
});
export const databaseEvent = z.object({
  id: z.uuid(),
  ...context,
  queryId: label,
  durationMs: duration,
  waitMs: duration.default(0),
  outcome: z.enum(["success", "error", "timeout"]),
  traceId: label.optional(),
  requestId: label.optional(),
  timestamp: z.iso.datetime(),
});

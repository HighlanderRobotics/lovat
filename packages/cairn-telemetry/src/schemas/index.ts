import { z } from "zod";

const label = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const duration = z.number().finite().min(0).max(86_400_000);
export const requestEvent = z
  .object({
    id: z.uuid(),
    requestId: z.string().min(1).max(128),
    traceId: z.string().max(128).optional(),
    receivedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    durationMs: duration,
    service: label,
    environment: label,
    deploymentId: z.string().max(128).optional(),
    appVersion: z.string().max(80).optional(),
    method: z.enum([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ]),
    route: z
      .string()
      .min(1)
      .max(500)
      .startsWith("/")
      .refine(
        (v) => !/[?#]/.test(v),
        "Use a normalized route without query parameters",
      ),
    statusCode: z.number().int().min(100).max(599),
    requestBytes: z.number().int().nonnegative().optional(),
    responseBytes: z.number().int().nonnegative().optional(),
    authDurationMs: duration.optional(),
    handlerDurationMs: duration.optional(),
    databaseDurationMs: duration.optional(),
    externalDurationMs: duration.optional(),
    errorCode: z.string().max(100).optional(),
    errorGroupId: z.uuid().optional(),
    metadata: z
      .record(
        z.string().max(80),
        z.union([z.string().max(500), z.number().finite(), z.boolean()]),
      )
      .refine((v) => Object.keys(v).length <= 30)
      .optional(),
  })
  .refine(
    (e) => Date.parse(e.completedAt) >= Date.parse(e.receivedAt),
    "Completion must follow receipt",
  )
  .refine(
    (e) => Date.parse(e.receivedAt) <= Date.now() + 60_000,
    "Future event",
  );
export type RequestEvent = z.infer<typeof requestEvent>;
export const errorEvent = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  service: label,
  environment: label,
  type: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  stack: z.string().max(12000).optional(),
  requestId: z.string().max(128).optional(),
  deploymentId: z.string().max(128).optional(),
  appVersion: z.string().max(80).optional(),
});
export const analyticsEvent = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  service: label,
  environment: label,
  name: label,
  path: z.string().max(500).optional(),
  durationMs: duration.optional(),
});
export const traceEvent = z.object({
  id: z.uuid(),
  traceId: z.string().min(1).max(128),
  parentId: z.uuid().optional(),
  name: z.string().min(1).max(200),
  service: label,
  environment: label,
  startedAt: z.iso.datetime(),
  durationMs: duration,
  kind: z
    .enum(["server", "client", "database", "internal"])
    .default("internal"),
});
export const caseInput = z.object({
  name: z.string().min(1).max(100),
  email: z.email().max(254),
  category: z.enum(["bug", "question", "account", "feedback"]),
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  teamNumber: z.coerce.number().int().positive().max(99999).optional(),
  requestId: z.string().max(128).optional(),
  website: z.string().max(0).optional(),
});
export const caseStates = [
  "New",
  "Open",
  "Waiting on requester",
  "Waiting on engineering",
  "Resolved",
  "Closed",
] as const;
export const incidentStates = [
  "Open",
  "Acknowledged",
  "Mitigating",
  "Resolved",
] as const;
export const queryInput = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    service: label.optional(),
    environment: label.optional(),
    q: z.string().max(200).optional(),
    status: z.coerce.number().int().min(100).max(599).optional(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
      .optional(),
    minDuration: z.coerce.number().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().max(300).optional(),
  })
  .refine(
    (v) =>
      Date.parse(v.end) > Date.parse(v.start) &&
      Date.parse(v.end) - Date.parse(v.start) <= 31 * 86400000,
    "Time window must be positive and at most 31 days",
  );
export type QueryInput = z.infer<typeof queryInput>;
export const ruleInput = z.object({
  name: z.string().min(3).max(120),
  service: label,
  environment: label,
  metric: z.enum(["error_rate", "p95_latency", "request_count"]),
  comparator: z.enum(["gt", "lt"]),
  threshold: z.number().nonnegative(),
  windowMinutes: z.number().int().min(1).max(60),
  minSamples: z.number().int().min(1),
  severity: z.enum(["SEV1", "SEV2", "SEV3"]),
  cooldownMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean().default(true),
});
export const role = z.enum(["admin", "developer", "viewer"]);

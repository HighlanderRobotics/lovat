import {
  createDiagnostics,
  createTelemetry,
  type TelemetryOptions,
} from "@cairn/telemetry";
import type { ImportJob } from "@lovat/db";

export type AttemptOutcome = "running" | "success" | "failed" | "cancelled";
export type AttemptObserver = (
  job: ImportJob,
  outcome: AttemptOutcome,
  startedAt: string,
) => void;

export function createWorkerTelemetry(
  env: Record<string, string | undefined> = process.env,
  fetcher?: TelemetryOptions["fetch"],
) {
  let requests: ReturnType<typeof createTelemetry> | undefined;
  let diagnostics: ReturnType<typeof createDiagnostics> | undefined;
  if (env.CAIRN_ENABLED === "true") {
    try {
      const url = new URL(env.CAIRN_URL ?? "");
      const environment =
        env.CAIRN_ENVIRONMENT ?? env.NODE_ENV ?? "development";
      const local =
        env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        !env.CAIRN_INGESTION_TOKEN?.trim() ||
        !/^[a-zA-Z0-9_.:-]{1,120}$/.test(environment)
      ) {
        throw new Error("Invalid Cairn configuration");
      }
      const options = {
        endpoint: url.origin,
        token: env.CAIRN_INGESTION_TOKEN,
        service: "lovat-worker",
        environment,
        deploymentId: env.RAILWAY_DEPLOYMENT_ID,
        fetch: fetcher,
      };
      requests = createTelemetry(options);
      diagnostics = createDiagnostics(options);
    } catch {
      console.warn(
        "Cairn worker telemetry disabled: check endpoint, environment, and ingestion credential.",
      );
    }
  }
  const record: AttemptObserver = (job, outcome, startedAt) => {
    if (!diagnostics) {
      return;
    }
    diagnostics.record("jobs", {
      jobId: job.id,
      kind: job.kind,
      queue: "imports",
      attempt: job.attempts + 1,
      outcome,
      startedAt,
      completedAt: outcome === "running" ? undefined : new Date().toISOString(),
      durationMs:
        outcome === "running" ? undefined : Date.now() - Date.parse(startedAt),
      deploymentId: env.RAILWAY_DEPLOYMENT_ID,
    });
  };
  return {
    requests,
    record,
    async shutdown() {
      await Promise.all([
        requests?.shutdown({ timeoutMs: 1000 }),
        diagnostics?.shutdown({ timeoutMs: 1000 }),
      ]);
    },
  };
}
export const cairn = createWorkerTelemetry();
export const recordImportAttempt = cairn.record;

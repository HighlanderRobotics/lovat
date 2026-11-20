import { createHash } from "node:crypto";
import {
  analysisResponseSchema,
  type AnalysisRequest,
  type AnalysisResponse,
} from "@lovat/api";
import type { AccessScope } from "./auth.js";
export interface CacheStore {
  generations(teams: readonly number[]): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}
export function createAnalysisCache(
  store: CacheStore,
  formulaVersions: (ids: readonly string[]) => string,
) {
  const inFlight = new Map<string, Promise<AnalysisResponse>>();
  return async (
    scope: AccessScope,
    request: AnalysisRequest,
    compute: () => Promise<AnalysisResponse>,
  ): Promise<AnalysisResponse> => {
    let key: string;
    try {
      const teams = [...new Set(request.teams)].sort((a, b) => a - b);
      const generations = await store.generations([0, ...teams]);
      const canonical = {
        scope: {
          userId: scope.userId,
          teamNumber: scope.teamNumber,
          role: scope.role,
          teams: {
            ...scope.sources.teams,
            items: [...scope.sources.teams.items].sort((a, b) => a - b),
          },
          tournaments: {
            ...scope.sources.tournaments,
            items: [...scope.sources.tournaments.items].sort(),
          },
        },
        request: {
          ...request,
          teams,
          metrics: [...new Set(request.metrics)].sort(),
        },
        generations,
        formulas: formulaVersions(request.metrics),
      };
      key = createHash("sha256")
        .update(JSON.stringify(canonical))
        .digest("hex");
      const cached = await store.get(key);
      if (cached) {
        try {
          const parsed = analysisResponseSchema.safeParse(JSON.parse(cached));
          if (parsed.success) return parsed.data;
        } catch {
          /* Replace malformed cache values after computing a fresh result. */
        }
      }
    } catch {
      return compute();
    }
    const existing = inFlight.get(key);
    if (existing) return structuredClone(await existing);
    if (inFlight.size >= 16) return compute();
    const pending = (async () => {
      const result = await compute();
      // TTL bounds stale results if delivery is delayed or revision keys are evicted.
      try {
        await store.set(key, JSON.stringify(result), 15);
      } catch {}
      return result;
    })();
    inFlight.set(key, pending);
    try {
      return structuredClone(await pending);
    } finally {
      inFlight.delete(key);
    }
  };
}

import { analysisBudget } from "./budget.js";
import type { AnalysisRequest } from "@lovat/api";
import type { AccessScope } from "./auth.js";
import type { AnalysisRepository } from "./repository.js";
import { analyzeReports } from "./metrics/engine.js";
import { season2026 } from "./metrics/season2026.js";
import { createAnalysisCache, type CacheStore } from "./cache.js";
import { HttpError } from "./errors.js";

export function createAnalysisService(
  repository: AnalysisRepository,
  store?: CacheStore,
) {
  const budget = analysisBudget;
  const cached = store
    ? createAnalysisCache(store, (ids) =>
        season2026
          .resolve(ids)
          .map((d) => d.metadata.id + "@" + d.metadata.version)
          .sort()
          .join(","),
      )
    : null;
  return async (scope: AccessScope, request: AnalysisRequest) => {
    let definitions;
    try {
      definitions = season2026.resolve(request.metrics);
    } catch {
      throw new HttpError(
        400,
        "UNKNOWN_METRIC",
        "One or more metrics are unknown",
      );
    }
    if (definitions.some((d) => d.metadata.season !== request.season))
      throw new HttpError(
        400,
        "UNSUPPORTED_SEASON",
        "Unsupported metric season",
      );
    const compute = () =>
      budget(async () => {
        const reports = await repository.loadReports(
          scope,
          request,
          new Set(definitions.flatMap((d) => d.metadata.requires)),
        );
        return analyzeReports(reports, request, season2026);
      });
    return cached ? cached(scope, request, compute) : compute();
  };
}

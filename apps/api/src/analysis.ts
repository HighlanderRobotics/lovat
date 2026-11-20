import { analysisBudget } from "./budget.js";
import type { AnalysisRequest } from "@lovat/api";
import { games, type GameCatalog, type GamePack } from "@lovat/games";
import type { AccessScope } from "./auth.js";
import type { AnalysisRepository } from "./repository.js";
import { createAnalysisCache, type CacheStore } from "./cache.js";
import { HttpError } from "./errors.js";
export function createAnalysisService(
  repository: AnalysisRepository,
  store?: CacheStore,
  catalog: GameCatalog = games,
) {
  const caches = new Map<GamePack, ReturnType<typeof createAnalysisCache>>();
  return async (scope: AccessScope, request: AnalysisRequest) => {
    const game = catalog.get(request.season, request.gameVersion);
    let definitions;
    try {
      definitions = game.metrics.resolve(request.metrics);
    } catch {
      throw new HttpError(
        400,
        "UNKNOWN_METRIC",
        "One or more metrics are unknown",
      );
    }
    const compute = () =>
      analysisBudget(async () => {
        const reports = await repository.loadReports(
          scope,
          request,
          new Set(
            definitions.flatMap((definition) => definition.metadata.requires),
          ),
        );
        return game.analyze(reports, request);
      });
    if (!store) return compute();
    let cached = caches.get(game);
    if (!cached) {
      cached = createAnalysisCache(
        store,
        (ids) =>
          game.descriptor.id +
          "@" +
          game.descriptor.version +
          ":" +
          game.metrics
            .resolve(ids)
            .map(
              (definition) =>
                definition.metadata.id + "@" + definition.metadata.version,
            )
            .sort()
            .join(","),
      );
      caches.set(game, cached);
    }
    return cached(scope, request, compute);
  };
}

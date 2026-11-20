import type { PrismaClient } from "@lovat/db";
import type { AnalysisRequest } from "@lovat/api";
import { games, type GameCatalog, type StoredGameReport } from "@lovat/games";
import { legacyAnalysisInput } from "@lovat/games/2026";
import type { AccessScope, AuthRepository } from "./auth.js";
import { createLegacy2026Repository } from "./gameAdapters/2026.js";
import { loadGameReports } from "./gameStorage.js";
export { loadDetailedReports } from "./gameAdapters/2026.js";
export interface AnalysisRepository {
  loadReports(
    scope: AccessScope,
    request: AnalysisRequest,
    requires: ReadonlySet<string>,
  ): Promise<StoredGameReport[]>;
}
type Reader = (
  scope: AccessScope,
  request: AnalysisRequest,
  requires: ReadonlySet<string>,
) => Promise<StoredGameReport[]>;
export function createRepository(
  db: PrismaClient,
  catalog: GameCatalog = games,
): AnalysisRepository & AuthRepository {
  const legacy = createLegacy2026Repository(db);
  // Compatibility adapters are explicit. Every new game uses versioned JSON storage by default.
  const readers = new Map<string, Reader>([
    [
      "frc-2026:1",
      async (scope, request, requires) =>
        (await legacy.loadReports(scope, request, requires)).map(
          legacyAnalysisInput,
        ),
    ],
  ]);
  return {
    userById: (id) =>
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          teamNumber: true,
          role: true,
          teamSourceRule: true,
          tournamentSourceRule: true,
          team: { select: { emailVerified: true } },
        },
      }),
    loadReports(scope, request, requires) {
      const game = catalog.get(request.season, request.gameVersion);
      return (
        readers.get(game.descriptor.id + ":" + game.descriptor.version)?.(
          scope,
          request,
          requires,
        ) ?? loadGameReports(db, scope, request, game)
      );
    },
  };
}

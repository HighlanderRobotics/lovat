import type { PrismaClient } from "@lovat/db";
import type { AnalysisRequest } from "@lovat/api";
import { games, type GameCatalog, type StoredGameReport } from "@lovat/games";
import { legacyAnalysisInput } from "@lovat/games/2026";
import type { AccessScope, AuthRepository } from "./auth.js";
import { createLegacy2026Repository } from "./gameAdapters/2026.js";
import { streamGameReports } from "./gameStorage.js";
export { loadDetailedReports } from "./gameAdapters/2026.js";
export interface AnalysisRepository {
  streamReports?(
    scope: AccessScope,
    request: AnalysisRequest,
    requires: ReadonlySet<string>,
  ): AsyncIterable<StoredGameReport>;
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
) => AsyncIterable<StoredGameReport>;
export function createRepository(
  db: PrismaClient,
  catalog: GameCatalog = games,
): AnalysisRepository & AuthRepository {
  const legacy = createLegacy2026Repository(db);
  // Compatibility adapters are explicit. Every new game uses versioned JSON storage by default.
  const readers = new Map<string, Reader>([
    [
      "frc-2026:1",
      async function* (scope, request, requires) {
        for await (const report of legacy.streamReports(
          scope,
          request,
          requires,
        ))
          yield legacyAnalysisInput(report);
      },
    ],
  ]);
  const repository: AnalysisRepository & AuthRepository = {
    async loadReports(scope, request, requires) {
      const rows: StoredGameReport[] = [];
      for await (const report of repository.streamReports!(
        scope,
        request,
        requires,
      ))
        rows.push(report);
      return rows;
    },
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
    streamReports(scope, request, requires) {
      const game = catalog.get(request.season, request.gameVersion);
      return (
        readers.get(game.descriptor.id + ":" + game.descriptor.version)?.(
          scope,
          request,
          requires,
        ) ?? streamGameReports(db, scope, request, game)
      );
    },
  };
  return repository;
}

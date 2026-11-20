import { gamePredictionRequestSchema } from "@lovat/api";
import { games, type GameCatalog } from "@lovat/games";
import { accessScope } from "../auth.js";
import { ServiceRouter, input, user } from "../http/router.js";
import { HttpError } from "../errors.js";
import type { Analyze } from "./analysis.js";
export function registerGamePredictions(
  router: ServiceRouter,
  analyze: Analyze,
  catalog: GameCatalog = games,
) {
  router.add("POST", "/v3/prediction", "session", async (ctx) => {
    const request = input(gamePredictionRequestSchema, ctx.body),
      game = catalog.get(request.season, request.gameVersion);
    const size = game.descriptor.rules.allianceSize;
    if (
      request.red.length !== size ||
      request.blue.length !== size ||
      new Set([...request.red, ...request.blue]).size !== size * 2
    )
      throw new HttpError(
        400,
        "INVALID_ALLIANCES",
        "Select the required number of distinct teams for this game",
      );
    if (!game.prediction)
      throw new HttpError(
        409,
        "PREDICTION_UNAVAILABLE",
        "Predictions are not configured for this game",
      );
    const data = await analyze(accessScope(user(ctx)), {
      teams: [...request.red, ...request.blue],
      metrics: [...game.prediction.metrics],
      season: request.season,
      gameVersion: game.descriptor.version,
      timeline: true,
    });
    return game.prediction.calculate({
      red: request.red.map((number) => data.teams[String(number)]),
      blue: request.blue.map((number) => data.teams[String(number)]),
    });
  });
}

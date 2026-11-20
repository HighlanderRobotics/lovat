import { z } from "zod";
import { gameReportEnvelopeSchema } from "@lovat/api";
import { games, type GameCatalog } from "@lovat/games";
import { ServiceRouter, Reply, input, notFound } from "../http/router.js";
import { HttpError } from "../errors.js";
import { writeGameReport } from "../gameWrite.js";
import {
  write2026Report,
  gameEnvelope2026,
} from "../gameAdapters/2026Write.js";
export function registerGameReports(
  router: ServiceRouter,
  catalog: GameCatalog = games,
) {
  router.add("POST", "/v3/reports", "collection", async (ctx) => {
    const envelope = input(gameReportEnvelopeSchema, ctx.body);
    const deviceId = input(
      z.string().min(1).max(200),
      ctx.headers["x-device-id"],
    );
    const game = catalog.get(envelope.season, envelope.gameVersion);
    if (game.descriptor.id !== envelope.gameId)
      throw new HttpError(
        400,
        "GAME_ID_MISMATCH",
        "Game does not match the selected season/version",
      );
    if (ctx.headers["x-scouter-uuid"] !== envelope.scouterUuid)
      throw new HttpError(
        403,
        "SCOUTER_MISMATCH",
        "Report must belong to the selected scout",
      );
    const actor =
      (await ctx.db.scouter.findFirst({
        where: {
          uuid: envelope.scouterUuid,
          sourceTeamNumber: ctx.collectionTeam,
          archived: false,
        },
      })) ?? notFound("Scout not found on this team");
    const tournament = await ctx.db.tournament.findUnique({
      where: { key: envelope.tournamentKey },
      select: { seasonYear: true },
    });
    if (!tournament || tournament.seasonYear !== envelope.season)
      throw new HttpError(
        409,
        "GAME_SEASON_MISMATCH",
        "Tournament does not match the report's season",
      );
    const identity = {
      tournamentKey: envelope.tournamentKey,
      teamNumber: envelope.teamNumber,
      matchNumber: envelope.matchNumber,
      matchType: envelope.matchType,
    };
    let slot = await ctx.db.teamMatchData.findFirst({ where: identity });
    if (!slot && envelope.matchType === "PRACTICE") {
      const key =
        envelope.tournamentKey +
        "_pm" +
        envelope.matchNumber +
        "_" +
        envelope.teamNumber;
      slot = await ctx.db.teamMatchData.upsert({
        where: { key },
        create: { key, ...identity },
        update: {},
      });
    }
    if (!slot) notFound("Team not found in match");
    const data = game.validate(envelope.data, envelope.reportVersion, {
      startTime: envelope.startTime,
      endTime: envelope.endTime,
    });
    const writers = new Map([
      [
        "frc-2026:1",
        () =>
          ctx.db.$transaction((tx) =>
            write2026Report(
              tx,
              gameEnvelope2026(envelope, data),
              actor,
              { key: slot!.key, tournament },
              deviceId,
              envelope.endTime,
            ),
          ),
      ],
    ]);
    const created = await (writers.get(
      game.descriptor.id + ":" + game.descriptor.version,
    )?.() ??
      ctx.db.$transaction((tx) =>
        writeGameReport(tx, game, envelope, slot!.key, actor.sourceTeamNumber),
      ));
    return new Reply(
      {
        uuid: envelope.uuid,
        created,
        gameId: envelope.gameId,
        gameVersion: envelope.gameVersion,
        reportVersion: envelope.reportVersion,
      },
      created ? 201 : 200,
    );
  });
}

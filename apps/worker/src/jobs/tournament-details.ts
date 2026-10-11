import { avatarDataUri } from "./avatar";
import type { PrismaClient } from "@lovat/db";
import type { createTbaClient } from "../providers/tba";
import { saveHeaders, savedHeaders, validateTarget } from "./shared";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<
    ReturnType<typeof createTbaClient>,
    "getSelections" | "getAwards" | "getTeamMedia" | "getMatchEvent"
  >;
};

export async function importTournamentDetails(
  eventKey: string,
  dependencies?: Dependencies,
) {
  validateTarget(eventKey);

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { key: eventKey },
  });

  if (tournament.seasonYear === null)
    throw new Error("Import tournament metadata first");

  const event = await tba.getMatchEvent(eventKey);

  if (!event.modified || event.data.key !== eventKey)
    throw new Error("Expected tournament metadata");

  const aliases = new Map<string, string>();

  for (const [numeric, alias] of Object.entries(event.data.remap_teams ?? {})) {
    if (aliases.has(alias)) throw new Error("Ambiguous participant mapping");

    aliases.set(alias, numeric);
  }

  function number(key: string) {
    const numeric = aliases.get(key) ?? key;

    if (!/^frc\d+$/.test(numeric))
      throw new Error(`Missing numeric mapping for ${key}`);

    const value = Number(numeric.slice(3));

    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new Error("Invalid team number");

    return value;
  }

  const selectionsKey = `event/${eventKey}/alliances`;
  const awardsKey = `event/${eventKey}/awards`;
  const metadataKey = `event/${eventKey}/details?dependency=event`;
  const [savedSelections, savedAwards, savedMetadata] = await Promise.all([
    savedHeaders(db, selectionsKey),
    savedHeaders(db, awardsKey),
    savedHeaders(db, metadataKey),
  ]);
  const sameMapping = event.etag && event.etag === savedMetadata?.etag;
  const [selections, awards] = await Promise.all([
    tba.getSelections(eventKey, sameMapping ? (savedSelections ?? {}) : {}),
    tba.getAwards(eventKey, sameMapping ? (savedAwards ?? {}) : {}),
  ]);

  await db.$transaction(async (tx) => {
    if (selections.modified) {
      const allianceSelections = selections.data.map((alliance) => ({
        teams: alliance.picks.map(number),
        backup: alliance.backup
          ? { in: number(alliance.backup.in), out: number(alliance.backup.out) }
          : null,
      }));

      await tx.tournament.update({
        where: { key: eventKey },
        data: { allianceSelections },
      });
      await saveHeaders(tx, selectionsKey, selections);
    }

    if (awards.modified) {
      if (awards.data.some((award) => award.event_key !== eventKey))
        throw new Error("Award event mismatch");

      const records = awards.data.map((award) => ({
        type: award.award_type,
        name: award.name,
        recipients: award.recipient_list.map((recipient) => ({
          teamNumber: recipient.team_key ? number(recipient.team_key) : null,
          name: recipient.awardee,
        })),
      }));

      await tx.tournament.update({
        where: { key: eventKey },
        data: { awards: records },
      });
      await saveHeaders(tx, awardsKey, awards);
    }

    await saveHeaders(tx, metadataKey, event);
  });

  const teams = await db.teamTournament.findMany({
    where: { tournamentKey: eventKey },
  });

  // Each avatar commits separately so a media failure does not roll back event details.
  for (const { teamNumber } of teams) {
    const season = await db.teamSeason.findUnique({
      where: {
        teamNumber_seasonYear: {
          teamNumber,
          seasonYear: tournament.seasonYear,
        },
      },
    });

    if (!season) continue; // The roster import will create missing season records.

    const resourceKey = `team/frc${teamNumber}/media/${tournament.seasonYear}`;
    const media = await tba.getTeamMedia(
      teamNumber,
      tournament.seasonYear,
      (await savedHeaders(db, resourceKey)) ?? {},
    );

    if (!media.modified) continue;

    const avatars = media.data.filter((item) => item.type === "avatar");
    const base64 = (avatars.find((item) => item.preferred) ?? avatars[0])
      ?.details?.base64Image;

    await db.$transaction(async (tx) => {
      await tx.teamSeason.update({
        where: {
          teamNumber_seasonYear: {
            teamNumber,
            seasonYear: tournament.seasonYear!,
          },
        },
        data: { avatar: avatarDataUri(base64) },
      });
      await saveHeaders(tx, resourceKey, media);
    });
  }
}

import type { PrismaClient } from "@lovat/db";
import type { createTbaClient, TbaMatch } from "../providers/tba";
import {
  lockTournament,
  refreshTournamentGaps,
  saveTournamentGaps,
} from "./gaps";

import { orderMatches } from "../match-order";

type Dependencies = {
  db: PrismaClient;
  tba: Pick<ReturnType<typeof createTbaClient>, "getMatchEvent" | "getMatches">;
};

const levels = {
  qm: "QUALIFICATION",
  ef: "EIGHTHFINAL",
  qf: "QUARTERFINAL",
  sf: "SEMIFINAL",
  f: "FINAL",
} as const;

const levelOrder = { pm: -1, qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

const timestamp = (seconds: number | null) =>
  seconds === null ? null : new Date(seconds * 1_000);

function legacyPlayoffNumber(match: TbaMatch, playoffType: number | null) {
  const semifinalCount =
    playoffType === 10 ? 13 : playoffType === 11 ? 5 : null;

  if (semifinalCount === null) return null;

  if (
    match.comp_level === "sf" &&
    match.match_number === 1 &&
    match.set_number <= semifinalCount
  ) {
    return match.set_number;
  }

  if (match.comp_level === "f" && match.set_number === 1) {
    return semifinalCount + match.match_number;
  }

  return null;
}

export const importMatches = async (
  eventKey: string,
  dependencies?: Dependencies,
) => {
  if (!eventKey.trim()) throw new Error("Tournament key is required");

  const { Prisma } = await import("@lovat/db");

  const { db, tba } = dependencies ?? {
    db: (await import("../db")).db,
    tba: (await import("../tba")).tba,
  };

  await db.tournament.findUniqueOrThrow({ where: { key: eventKey } });

  const matchIdentity = {
    provider: "tba",
    resourceKey: `event/${eventKey}/matches`,
  };
  const eventIdentity = {
    provider: "tba",
    resourceKey: `event/${eventKey}/matches?dependency=event`,
  };

  const [savedMatches, savedEvent, event] = await Promise.all([
    db.fetchState.findUnique({
      where: { provider_resourceKey: matchIdentity },
    }),
    db.fetchState.findUnique({
      where: { provider_resourceKey: eventIdentity },
    }),
    tba.getMatchEvent(eventKey),
  ]);

  if (!event.modified || event.data.key !== eventKey) {
    throw new Error("Expected fresh metadata for the requested tournament");
  }

  // Remappings affect participant identity even when the match payload is unchanged.
  const metadataUnchanged = Boolean(
    event.etag && savedEvent?.etag === event.etag,
  );

  const fetched = await tba.getMatches(
    eventKey,
    metadataUnchanged
      ? {
          etag: savedMatches?.etag,
          lastModified: savedMatches?.lastModified,
        }
      : {},
  );

  if (!fetched.modified) {
    await refreshTournamentGaps(eventKey, { db });
    return;
  }

  const matches = orderMatches(
    fetched.data.filter((match) => match.comp_level !== "pm"),
    (match) => ({
      level: levelOrder[match.comp_level],
      set: match.set_number,
      number: match.match_number,
      scheduled: match.time,
      actual: match.actual_time,
    }),
    event.data.playoff_type === 10 || event.data.playoff_type === 11,
  );

  const aliases = new Map<string, string>();

  for (const [numericKey, participantKey] of Object.entries(
    event.data.remap_teams ?? {},
  )) {
    if (aliases.has(participantKey))
      throw new Error(`Ambiguous participant mapping: ${participantKey}`);

    aliases.set(participantKey, numericKey);
  }

  await db.$transaction(
    async (tx) => {
      await lockTournament(tx, eventKey);

      let eliminationOrder = 0;

      for (const [index, match] of matches.entries()) {
        if (
          match.event_key !== eventKey ||
          !match.key.startsWith(`${eventKey}_`)
        ) {
          throw new Error(`Match does not belong to tournament: ${match.key}`);
        }

        if (match.comp_level === "pm") continue;

        const qualification = match.comp_level === "qm";
        if (!qualification) eliminationOrder++;

        const playoffNumber = legacyPlayoffNumber(
          match,
          event.data.playoff_type,
        );
        const displayNumber = qualification
          ? match.match_number
          : (playoffNumber ?? eliminationOrder);
        const completed = [
          match.alliances.red.score,
          match.alliances.blue.score,
        ].every((score) => score !== null && score >= 0);

        const data = {
          tournamentKey: eventKey,
          competitionLevel: levels[match.comp_level],
          setNumber: match.set_number,
          matchNumber: match.match_number,
          displayOrder: index + 1,
          scheduledTime: timestamp(match.time),
          predictedTime: timestamp(match.predicted_time),
          actualTime: timestamp(match.actual_time),
          postResultTime: timestamp(match.post_result_time),
          status: completed ? ("COMPLETED" as const) : ("SCHEDULED" as const),
          winningAlliance:
            completed && match.winning_alliance
              ? match.winning_alliance === "red"
                ? ("RED" as const)
                : ("BLUE" as const)
              : null,
        };

        await tx.match.upsert({
          where: { key: match.key },
          update: data,
          create: { key: match.key, ...data },
        });

        for (const [color, alliance] of Object.entries(match.alliances) as [
          "red" | "blue",
          TbaMatch["alliances"]["red"],
        ][]) {
          const allianceColor =
            color === "red" ? ("RED" as const) : ("BLUE" as const);

          const allianceData = {
            score:
              alliance.score === null || alliance.score < 0
                ? null
                : alliance.score,
            scoreBreakdown: match.score_breakdown?.[color] ?? Prisma.DbNull,
          };

          await tx.matchAlliance.upsert({
            where: {
              matchKey_color: { matchKey: match.key, color: allianceColor },
            },
            update: allianceData,
            create: {
              matchKey: match.key,
              color: allianceColor,
              ...allianceData,
            },
          });

          const removedSlots = await tx.teamMatchData.findMany({
            where: {
              matchKey: match.key,
              alliance: allianceColor,
              station: { gt: alliance.team_keys.length },
            },
            include: { _count: { select: { scoutReports: true } } },
          });

          for (const removed of removedSlots) {
            if (removed._count.scoutReports > 0) {
              throw new Error(
                `Removed participant requires scouting reconciliation: ${removed.key}`,
              );
            }

            await tx.teamMatchData.delete({ where: { key: removed.key } });
          }

          for (const [slot, participantKey] of alliance.team_keys.entries()) {
            const numericKey = aliases.get(participantKey) ?? participantKey;

            if (!/^frc\d+$/.test(numericKey)) {
              throw new Error(`Missing numeric mapping for ${participantKey}`);
            }

            const teamNumber = Number(numericKey.slice(3));

            if (
              !Number.isSafeInteger(teamNumber) ||
              teamNumber <= 0 ||
              teamNumber > 2_147_483_647
            ) {
              throw new Error(`Invalid team number: ${numericKey}`);
            }

            const station = slot + 1;
            const slotIndex = (color === "red" ? 0 : 3) + slot;
            const legacyKey = qualification
              ? `${eventKey}_qm${match.match_number}_${slotIndex}`
              : playoffNumber === null
                ? null
                : `${eventKey}_em${playoffNumber}_${slotIndex}`;

            const linked = await tx.teamMatchData.findUnique({
              where: {
                matchKey_alliance_station: {
                  matchKey: match.key,
                  alliance: allianceColor,
                  station,
                },
              },
              include: { _count: { select: { scoutReports: true } } },
            });

            const existing =
              linked ??
              (await tx.teamMatchData.findUnique({
                where: { key: legacyKey ?? `${match.key}_${slotIndex}` },
                include: { _count: { select: { scoutReports: true } } },
              }));

            if (
              existing &&
              ((existing.matchKey && existing.matchKey !== match.key) ||
                (existing.teamNumber !== teamNumber &&
                  existing._count.scoutReports > 0))
            ) {
              throw new Error(
                `Participant change requires scouting reconciliation: ${existing.key}`,
              );
            }

            await tx.team.upsert({
              where: { number: teamNumber },
              update: {},
              create: { number: teamNumber, name: `Team ${teamNumber}` },
            });

            const slotData = {
              tournamentKey: eventKey,
              matchNumber: existing?.matchNumber ?? displayNumber,
              matchType: qualification
                ? ("QUALIFICATION" as const)
                : ("ELIMINATION" as const),
              teamNumber,
              matchKey: match.key,
              alliance: allianceColor,
              station,
              externalParticipantKey: participantKey,
              disqualified: alliance.dq_team_keys.includes(participantKey),
              surrogate: alliance.surrogate_team_keys.includes(participantKey),
            };

            const key =
              existing?.key ?? legacyKey ?? `${match.key}_${slotIndex}`;

            await tx.teamMatchData.upsert({
              where: { key },
              update: slotData,
              create: { key, ...slotData },
            });
          }
        }
      }

      await saveTournamentGaps(tx, eventKey);

      for (const [identity, response] of [
        [matchIdentity, fetched],
        [eventIdentity, event],
      ] as const) {
        const headers = {
          etag: response.etag,
          lastModified: response.lastModified,
        };

        await tx.fetchState.upsert({
          where: { provider_resourceKey: identity },
          update: headers,
          create: { ...identity, ...headers },
        });
      }

      await tx.tournament.update({
        where: { key: eventKey },
        data: {
          playoffType: event.data.playoff_type,
          officialDataUpdatedAt: new Date(),
          officialDataRevision: { increment: 1 },
        },
      });
    },
    { timeout: 60_000 },
  );
};

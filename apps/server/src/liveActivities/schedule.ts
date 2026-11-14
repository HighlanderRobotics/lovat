import db from "../prismaClient.js";
import {
  activityMatchLabel,
  buildActivityState,
  ScheduledMatch,
  ScoutingActivityState,
} from "./state.js";

const positions = [
  "team1",
  "team2",
  "team3",
  "team4",
  "team5",
  "team6",
] as const;

export async function scoutingActivityState(
  sourceTeamNumber: number,
  scouterUuid: string,
  tournamentKey: string,
): Promise<ScoutingActivityState | null> {
  const [scout, tournament, shifts, teams] = await Promise.all([
    db.scouter.findFirst({
      where: { uuid: scouterUuid, sourceTeamNumber, archived: false },
      select: { uuid: true },
    }),
    db.tournament.findUnique({ where: { key: tournamentKey } }),
    db.scouterScheduleShift.findMany({
      where: { sourceTeamNumber, tournamentKey },
      include: {
        team1: { select: { uuid: true } },
        team2: { select: { uuid: true } },
        team3: { select: { uuid: true } },
        team4: { select: { uuid: true } },
        team5: { select: { uuid: true } },
        team6: { select: { uuid: true } },
      },
    }),
    db.teamMatchData.findMany({
      where: {
        tournamentKey,
        matchType: { in: ["QUALIFICATION", "ELIMINATION"] },
      },
      include: {
        match: true,
        scoutReports: {
          where: {
            scouterUuid,
            scouter: { sourceTeamNumber },
            training: false,
          },
          select: { uuid: true },
        },
      },
      orderBy: [{ matchType: "asc" }, { matchNumber: "asc" }, { key: "asc" }],
    }),
  ]);

  if (!scout || !tournament) {
    return null;
  }

  // Don't resurrect last season's unfinished assignments or start days early.
  const today = Date.now();
  if (
    (tournament.startDate &&
      tournament.startDate.getTime() > today + 86400000) ||
    (tournament.endDate && tournament.endDate.getTime() + 2 * 86400000 < today)
  ) {
    return null;
  }

  const maxQualifier = Math.max(
    0,
    ...teams
      .filter((row) => row.matchType === "QUALIFICATION")
      .map((row) => row.matchNumber),
  );
  const matches = new Map<string, ScheduledMatch>();

  for (const row of teams) {
    const ordinal =
      row.matchType === "QUALIFICATION"
        ? row.matchNumber
        : maxQualifier + row.matchNumber;
    const key = `${row.matchType}:${row.matchNumber}`;
    const canonical = row.match;
    const match = matches.get(key) ?? {
      ordinal,
      matchKey: canonical?.key ?? `${tournamentKey}_${key}`,
      matchLabel: activityMatchLabel(row.matchType, row.matchNumber, canonical),
      complete:
        canonical?.status === "COMPLETED" || canonical?.status === "CANCELED",
      startTime:
        (canonical?.predictedTime ?? canonical?.scheduledTime)?.getTime() /
          1000 || null,
      assignment: null,
    };
    const slot =
      row.alliance && row.station
        ? (row.alliance === "RED" ? 0 : 3) + row.station - 1
        : Number(row.key.split("_").at(-1));

    if (Number.isInteger(slot) && slot >= 0 && slot < positions.length) {
      const assigned = shifts.some(
        (shift) =>
          shift.startMatchOrdinalNumber <= ordinal &&
          shift.endMatchOrdinalNumber >= ordinal &&
          shift[positions[slot]].some((scout) => scout.uuid === scouterUuid),
      );

      if (assigned) {
        match.assignment = {
          teamNumber: row.teamNumber,
          submitted: row.scoutReports.length > 0,
        };
      }
    }

    matches.set(key, match);
  }

  return buildActivityState([...matches.values()], tournament.name);
}

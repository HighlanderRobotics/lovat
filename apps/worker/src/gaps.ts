import type { Match, Prisma } from "@lovat/db";

import { orderMatches } from "./match-order";

type MatchTiming = Pick<
  Match,
  | "key"
  | "competitionLevel"
  | "setNumber"
  | "matchNumber"
  | "scheduledTime"
  | "actualTime"
  | "predictedTime"
  | "postResultTime"
> &
  Partial<Pick<Match, "displayOrder">>;

const minute = 60_000;
const minGap = 30 * minute;
const estimatedMatchDuration = 3 * minute;
const levels = {
  QUALIFICATION: 0,
  EIGHTHFINAL: 1,
  QUARTERFINAL: 2,
  SEMIFINAL: 3,
  FINAL: 4,
};

function localTime(date: Date, timezone: string | null) {
  // Without a valid timezone, do not guess lunch or a local day boundary.
  if (!timezone) return null;

  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );

    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
  } catch {
    return null;
  }
}

function pairTiming(after: MatchTiming, before: MatchTiming) {
  if (after.actualTime && before.actualTime) {
    return {
      after: after.actualTime,
      before: before.actualTime,
      timingSource: "ACTUAL" as const,
    };
  }

  if (after.scheduledTime && before.scheduledTime) {
    return {
      after: after.scheduledTime,
      before: before.scheduledTime,
      timingSource: "SCHEDULED" as const,
    };
  }

  if (after.predictedTime && before.predictedTime) {
    return {
      after: after.predictedTime,
      before: before.predictedTime,
      timingSource: "PREDICTED" as const,
    };
  }

  return null;
}

export function inferTournamentGaps(
  tournamentKey: string,
  timezone: string | null,
  matches: MatchTiming[],
) {
  const ordered = orderMatches(matches, (match) => ({
    level: levels[match.competitionLevel],
    set: match.setNumber,
    number: match.matchNumber,
    scheduled: match.scheduledTime?.getTime() ?? null,
    actual: match.actualTime?.getTime() ?? null,
    display: match.displayOrder,
  }));
  const gaps: Prisma.TournamentGapCreateManyInput[] = [];

  for (let index = 1; index < ordered.length; index++) {
    const after = ordered[index - 1]!;
    const before = ordered[index]!;

    if (
      after.competitionLevel === "QUALIFICATION" &&
      before.competitionLevel === "QUALIFICATION" &&
      before.matchNumber !== after.matchNumber + 1
    )
      continue;

    const timing = pairTiming(after, before);

    // Never bridge over a match with missing timing, or mix actual and planned clocks.
    if (!timing) continue;

    const duration = timing.before.getTime() - timing.after.getTime();
    const playoffTransition =
      after.competitionLevel === "QUALIFICATION" &&
      before.competitionLevel !== "QUALIFICATION";

    if (duration < (playoffTransition ? 15 * minute : minGap)) continue;

    const from = localTime(timing.after, timezone);
    const to = localTime(timing.before, timezone);
    const scheduledDuration =
      after.scheduledTime && before.scheduledTime
        ? before.scheduledTime.getTime() - after.scheduledTime.getTime()
        : null;
    const unplanned =
      timing.timingSource === "ACTUAL" &&
      scheduledDuration !== null &&
      scheduledDuration > 0 &&
      scheduledDuration < (playoffTransition ? 15 * minute : minGap);

    let type: Prisma.TournamentGapCreateManyInput["type"] = "BREAK";

    if (from && to && from.date !== to.date && duration >= 4 * 60 * minute) {
      type = "OVERNIGHT";
    } else if (unplanned) {
      type = "DELAY";
    } else if (playoffTransition) {
      type = "PLAYOFF_TRANSITION";
    } else if (
      from &&
      to &&
      from.date === to.date &&
      from.minutes >= 10 * 60 + 30 &&
      from.minutes <= 14 * 60 &&
      to.minutes >= 11 * 60 &&
      to.minutes <= 15 * 60 &&
      (from.minutes + to.minutes) / 2 >= 11 * 60 + 30 &&
      duration <= 3 * 60 * minute
    ) {
      type = "LUNCH";
    }

    // Result publication is only useful if it falls between the adjacent starts.
    const resultTime =
      timing.timingSource === "ACTUAL" ? after.postResultTime : null;
    const startTime =
      resultTime && resultTime > timing.after && resultTime < timing.before
        ? resultTime
        : new Date(timing.after.getTime() + estimatedMatchDuration);

    gaps.push({
      tournamentKey,
      afterMatchKey: after.key,
      beforeMatchKey: before.key,
      type,
      timingSource: timing.timingSource,
      startTime,
      endTime: timing.before,
    });
  }

  return gaps;
}

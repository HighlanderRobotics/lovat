import type { Tournament } from "@lovat/db";

export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

type EventDates = Pick<Tournament, "startDate" | "endDate" | "timezone">;

export function tournamentCadence(event: EventDates, now = new Date()) {
  if (!event.startDate || !event.endDate) {
    return { phase: "unknown", matches: day, roster: day } as const;
  }

  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: event.timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
  }

  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const start = event.startDate.toISOString().slice(0, 10);
  const end = event.endDate.toISOString().slice(0, 10);

  if (localDate >= start && localDate <= end) {
    const eventHours = Number(parts.hour) >= 7 && Number(parts.hour) < 21;

    return {
      phase: "active",
      matches: eventHours ? minute : 15 * minute,
      roster: hour,
    } as const;
  }

  const today = Date.parse(`${localDate}T00:00:00Z`);

  if (localDate < start) {
    const soon = event.startDate.getTime() - today <= 7 * day;

    return {
      phase: "upcoming",
      matches: soon ? 30 * minute : day,
      roster: soon ? 6 * hour : day,
    } as const;
  }

  const recent = today - event.endDate.getTime() <= 7 * day;

  return {
    phase: "finished",
    matches: recent ? 6 * hour : 7 * day,
    roster: recent ? day : 7 * day,
  } as const;
}

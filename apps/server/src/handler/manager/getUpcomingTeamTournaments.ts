import { Response } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";

const eventSchema = z.object({
  key: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  start_date: z.iso.date(),
  timezone: z.string().nullish(),
  week: z.number().int().nonnegative().nullish(),
});

export const getUpcomingTeamTournaments = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (!req.user.teamNumber) {
    res.status(200).json([]);
    return;
  }
  try {
    // Team registrations exist before match schedules are published.
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/team/frc${req.user.teamNumber}/events`,
      {
        headers: process.env.TBA_KEY?.trim()
          ? { "X-TBA-Auth-Key": process.env.TBA_KEY.trim() }
          : {},
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      throw new Error("Team events unavailable");
    }
    const events = z.array(eventSchema).parse(await response.json());
    const upcoming = events
      .filter((event) => {
        const today = DateTime.now()
          .setZone(event.timezone || "UTC")
          .toISODate();
        return today != null && event.start_date > today;
      })
      .sort(
        (a, b) =>
          a.start_date.localeCompare(b.start_date) ||
          a.key.localeCompare(b.key),
      );
    const unique = [
      ...new Map(upcoming.map((event) => [event.key, event])).values(),
    ];
    res.status(200).json(
      unique.slice(0, 2).map((event) => ({
        key: event.key,
        name: event.name,
        city: event.city,
        startDate: event.start_date,
        // TBA's regular-season weeks are zero-based.
        week: event.week == null ? null : event.week + 1,
      })),
    );
  } catch {
    res.status(502).json({
      displayError:
        "Could not load your team's upcoming tournaments from The Blue Alliance.",
    });
  }
};

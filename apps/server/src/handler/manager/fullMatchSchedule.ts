import type { Request, Response } from "express";
import z from "zod";

type ScheduleRow = {
  key: string;
  matchNumber: number;
  matchType: string;
  teamNumber: number;
};
type FullSchedule = {
  tournamentKey: string;
  matches: {
    matchNumber: number;
    matchType: 0 | 1 | 2;
    teams: { number: number; alliance: "red" | "blue" | null }[];
  }[];
};
export function formatMatchSchedule(
  tournamentKey: string,
  rows: ScheduleRow[],
): FullSchedule {
  const matches = new Map<
    string,
    {
      matchNumber: number;
      matchType: 0 | 1 | 2;
      teams: { number: number; alliance: "red" | "blue" | null }[];
    }
  >();
  for (const row of rows) {
    const matchType =
      row.matchType === "QUALIFICATION"
        ? 0
        : row.matchType === "ELIMINATION"
          ? 1
          : row.matchType === "PRACTICE"
            ? 2
            : null;
    if (matchType === null) continue;
    const key = `${matchType}:${row.matchNumber}`;
    const match = matches.get(key) ?? {
      matchNumber: row.matchNumber,
      matchType,
      teams: [],
    };
    const suffix = row.key.at(-1);
    const alliance =
      suffix && /^[0-5]$/.test(suffix)
        ? Number(suffix) < 3
          ? "red"
          : "blue"
        : null;
    if (!match.teams.some((team) => team.number === row.teamNumber))
      match.teams.push({ number: row.teamNumber, alliance });
    matches.set(key, match);
  }
  return {
    tournamentKey,
    matches: [...matches.values()].sort(
      (a, b) => a.matchType - b.matchType || a.matchNumber - b.matchNumber,
    ),
  };
}
export function createFullMatchScheduleHandler(dependencies: {
  authorize: (code: string) => Promise<boolean>;
  refresh: (tournamentKey: string) => Promise<void>;
  read: (tournamentKey: string) => Promise<ScheduleRow[]>;
}): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = z
      .object({
        code: z.string().min(1),
        tournament: z.string().min(1).max(128),
      })
      .safeParse({
        code: req.headers["x-team-code"],
        tournament: req.params.tournament,
      });
    if (!parsed.success) {
      res
        .status(400)
        .json({ displayError: "A team code and tournament are required." });
      return;
    }
    try {
      if (!(await dependencies.authorize(parsed.data.code))) {
        res.status(401).json({ displayError: "Invalid team code." });
        return;
      }
      // Return imported fixtures even when the upstream provider is unavailable.
      await dependencies.refresh(parsed.data.tournament).catch(() => undefined);
      const rows = await dependencies.read(parsed.data.tournament);
      if (!rows.length) {
        res.status(404).json({
          displayError: "The tournament schedule is not available yet.",
        });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(formatMatchSchedule(parsed.data.tournament, rows));
    } catch {
      res
        .status(500)
        .json({ displayError: "Unable to load the tournament schedule." });
    }
  };
}

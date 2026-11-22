import { norCalExample } from "../../lib/strategy/norCalExample.js";
import type { Response } from "express";
import { MatchStatus, MatchType } from "@lovat/db";
import z from "zod";
import prisma from "../../prismaClient.js";
import type { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { reportReliabilityFilter } from "../analysis/reportReliabilityFilter.js";
import { scoutReportSourceFilter } from "../analysis/scoutReportSourceFilter.js";
import {
  claudeStrategyProvider,
  StrategyUnavailableError,
} from "../../lib/strategy/provider.js";

const paramsSchema = z.object({
  tournament: z
    .string()
    .regex(/^\d{4}[a-zA-Z0-9_-]+$/)
    .max(100),
});
const draftSchema = z
  .object({
    matchKey: z.string().min(1).max(150),
    briefing: z.string().trim().max(2000).default(""),
  })
  .strict();

class StrategyContextError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function collectContext(req: AuthenticatedRequest) {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    throw new StrategyContextError(400, "Select a valid tournament.");
  }
  const teamNumber = req.user.teamNumber;
  if (!teamNumber) {
    throw new StrategyContextError(
      403,
      "Join a team before drafting a match strategy.",
    );
  }

  const tournamentKey = params.data.tournament;
  const tournament = await prisma.tournament.findUnique({
    where: { key: tournamentKey },
    select: { key: true, name: true },
  });
  if (!tournament) {
    throw new StrategyContextError(404, "Tournament not found.");
  }

  const match = await prisma.match.findFirst({
    where: {
      tournamentKey,
      status: MatchStatus.SCHEDULED,
      teamSlots: { some: { teamNumber } },
    },
    orderBy: [
      { displayOrder: { sort: "asc", nulls: "last" } },
      { scheduledTime: "asc" },
      { key: "asc" },
    ],
    select: {
      key: true,
      competitionLevel: true,
      matchNumber: true,
      setNumber: true,
      scheduledTime: true,
      teamSlots: {
        select: { teamNumber: true, alliance: true, station: true },
      },
    },
  });
  if (!match) {
    throw new StrategyContextError(
      404,
      "No upcoming match for your team at this tournament. The schedule may not be posted yet, or your team has finished playing.",
    );
  }
  if (
    match.teamSlots.length !== 6 ||
    match.teamSlots.some((slot) => !slot.alliance) ||
    new Set(match.teamSlots.map((slot) => slot.teamNumber)).size !== 6 ||
    match.teamSlots.filter((slot) => slot.alliance === "RED").length !== 3
  ) {
    throw new StrategyContextError(
      409,
      "The next match has incomplete alliance assignments. Refresh after the schedule updates.",
    );
  }

  const sourceFilter = scoutReportSourceFilter(req.user);
  // Intersect the chosen event with both saved source rules; selecting an event
  // must never broaden access to reports or include training observations.
  const teams = await Promise.all(
    match.teamSlots.map(async (slot) => {
      const reports = await prisma.scoutReport.findMany({
        where: {
          AND: [
            sourceFilter,
            reportReliabilityFilter,
            {
              teamMatchData: {
                tournamentKey,
                teamNumber: slot.teamNumber,
                matchType: { not: MatchType.PRACTICE },
                match: { status: MatchStatus.COMPLETED },
              },
            },
          ],
        },
        orderBy: [{ startTime: "desc" }, { uuid: "asc" }],
        take: 20,
        select: {
          teamMatchKey: true,
          notes: true,
          robotRoles: true,
          driverAbility: true,
          defenseEffectiveness: true,
          robotBrokeDescription: true,
          endgameClimb: true,
          autoClimb: true,
          events: { select: { action: true, points: true, quantity: true } },
        },
      });
      return {
        ...slot,
        reports: reports.map(
          ({ events, notes, robotBrokeDescription, ...report }) => {
            const actions: Record<
              string,
              { count: number; points: number; quantity: number }
            > = {};
            for (const event of events) {
              const totals = (actions[event.action] ??= {
                count: 0,
                points: 0,
                quantity: 0,
              });
              totals.count++;
              totals.points += event.points;
              totals.quantity += event.quantity ?? 0;
            }
            return {
              ...report,
              notes: notes.slice(0, 1200),
              robotBrokeDescription: robotBrokeDescription?.slice(0, 500),
              actions,
            };
          },
        ),
      };
    }),
  );

  return {
    tournament,
    teamNumber,
    match,
    teams,
    collectedAt: new Date().toISOString(),
  };
}

function summary(
  context:
    | Awaited<ReturnType<typeof collectContext>>
    | ReturnType<typeof norCalExample>,
) {
  const { teams, ...rest } = context;
  return {
    ...rest,
    teams: teams.map(({ reports, ...team }) => ({
      ...team,
      reportCount: reports.length,
    })),
    reportCount: teams.reduce((sum, team) => sum + team.reports.length, 0),
  };
}

// Bound the evidence for the small on-device model. Ratings summarize all
// sourced reports; notes use only the three most recent reports for each team.
function localPrompt(
  context:
    | Awaited<ReturnType<typeof collectContext>>
    | ReturnType<typeof norCalExample>,
) {
  return JSON.stringify({
    isExample: "isExample" in context && context.isExample,
    tournament: context.tournament,
    teamNumber: context.teamNumber,
    match: context.match.key,
    teams: context.teams.map((team) => ({
      team: team.teamNumber,
      alliance: team.alliance,
      reports: team.reports.length,
      driverAbility: team.reports.length
        ? team.reports.reduce((sum, report) => sum + report.driverAbility, 0) /
          team.reports.length
        : null,
      defenseEffectiveness: team.reports.length
        ? team.reports.reduce(
            (sum, report) => sum + report.defenseEffectiveness,
            0,
          ) / team.reports.length
        : null,
      observations: team.reports.slice(0, 3).map((report) => ({
        match: report.teamMatchKey,
        note: report.notes.slice(0, 160),
        ...("endgameClimb" in report
          ? {
              endgameClimb: report.endgameClimb,
              autoClimb: report.autoClimb,
              breakdown: report.robotBrokeDescription?.slice(0, 100),
            }
          : {}),
      })),
    })),
  });
}

function handleError(error: unknown, res: Response) {
  if (error instanceof StrategyContextError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof StrategyUnavailableError) {
    res
      .status(503)
      .json({ code: "STRATEGY_UNAVAILABLE", message: error.message });
    return;
  }
  throw error;
}

export async function getAiStrategyContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  res.set("Cache-Control", "no-store");
  try {
    const context = await collectContext(req);
    res.json({
      ...summary(context),
      ...(req.query.local === "true"
        ? { localPrompt: localPrompt(context) }
        : {}),
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function draftAiStrategy(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  res.set("Cache-Control", "no-store");
  const body = draftSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      message:
        "Provide the next match and a team briefing of at most 2,000 characters.",
    });
    return;
  }

  try {
    // Re-read all data rather than accepting client-supplied reports or team IDs.
    const context = await collectContext(req);
    if (body.data.matchKey !== context.match.key) {
      throw new StrategyContextError(
        409,
        "Your next match changed. Refresh the match before generating a strategy.",
      );
    }
    if (!context.teams.some((team) => team.reports.length > 0)) {
      throw new StrategyContextError(
        422,
        "No completed-match scouting reports are available with your source settings at this tournament.",
      );
    }

    const draft = await claudeStrategyProvider.draft({
      ...context,
      teamBriefing: body.data.briefing,
    });
    res.json({ ...summary(context), draft });
  } catch (error) {
    handleError(error, res);
  }
}

// The example reads only a fixed synthetic fixture. It never queries a user's
// reports, changes their team membership, or broadens their saved source rules.
export async function getAiStrategyExample(
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  res.set("Cache-Control", "no-store");
  const context = norCalExample();
  res.json({
    ...summary(context),
    ...(_req.query.local === "true"
      ? { localPrompt: localPrompt(context) }
      : {}),
  });
}

export async function draftAiStrategyExample(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  res.set("Cache-Control", "no-store");
  const body = draftSchema.safeParse(req.body);
  const context = norCalExample();
  if (!body.success || body.data.matchKey !== context.match.key) {
    res.status(400).json({
      message:
        "Load the NorCal example before drafting. Briefings must be at most 2,000 characters.",
    });
    return;
  }

  try {
    const draft = await claudeStrategyProvider.draft({
      ...context,
      teamBriefing: body.data.briefing,
    });
    const content = draft.replace(/^[\s*#]*EXAMPLE ONLY[^\n]*\n*/i, "");
    const labeledDraft = `EXAMPLE ONLY — hypothetical match and synthetic scouting, not actual event results.\n\n${content}`;
    res.json({ ...summary(context), draft: labeledDraft });
  } catch (error) {
    handleError(error, res);
  }
}

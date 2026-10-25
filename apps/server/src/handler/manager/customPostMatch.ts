import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/middleware/requireAuth.js";
import { customPostMatchSettingsSchema } from "../../lib/customPostMatch.js";

type TeamQuestions = { number: number; customPostMatch: string[] };
type Dependencies = {
  readByCode: (code: string) => Promise<TeamQuestions | null>;
  readByTeam: (team: number) => Promise<TeamQuestions | null>;
  update: (team: number, questions: string[]) => Promise<TeamQuestions>;
};
type Handlers = {
  collection: (req: Request, res: Response) => Promise<void>;
  settings: (req: AuthenticatedRequest, res: Response) => Promise<void>;
  update: (req: AuthenticatedRequest, res: Response) => Promise<void>;
};

export function createCustomPostMatchHandlers(deps: Dependencies): Handlers {
  const send = (res: Response, team: TeamQuestions) => {
    res.setHeader("Cache-Control", "private, no-store");
    res
      .status(200)
      .json({ teamNumber: team.number, customPostMatch: team.customPostMatch });
  };
  return {
    collection: async (req: Request, res: Response): Promise<void> => {
      const code = req.headers["x-team-code"];
      if (typeof code !== "string" || !code.trim()) {
        res
          .status(401)
          .json({ displayError: "A valid team code is required." });
        return;
      }
      try {
        const team = await deps.readByCode(code);
        if (!team) {
          res.status(401).json({ displayError: "Invalid team code." });
          return;
        }
        send(res, team);
      } catch {
        res
          .status(500)
          .json({ displayError: "Could not load custom questions." });
      }
    },
    settings: async (
      req: AuthenticatedRequest,
      res: Response,
    ): Promise<void> => {
      if (req.user.teamNumber == null) {
        res.status(403).json({ displayError: "Join a team first." });
        return;
      }
      try {
        const team = await deps.readByTeam(req.user.teamNumber);
        if (!team) {
          res.status(404).json({ displayError: "Team not found." });
          return;
        }
        send(res, team);
      } catch {
        res
          .status(500)
          .json({ displayError: "Could not load custom questions." });
      }
    },
    update: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      if (
        req.tokenType === "apiKey" ||
        req.user.role !== "SCOUTING_LEAD" ||
        req.user.teamNumber == null
      ) {
        res.status(403).json({
          displayError: "Only scouting leads can edit custom questions.",
        });
        return;
      }
      const parsed = customPostMatchSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          displayError: "Use up to 3 unique questions, each 1–300 characters.",
        });
        return;
      }
      try {
        send(
          res,
          await deps.update(req.user.teamNumber, parsed.data.customPostMatch),
        );
      } catch {
        res
          .status(500)
          .json({ displayError: "Could not save custom questions." });
      }
    },
  };
}

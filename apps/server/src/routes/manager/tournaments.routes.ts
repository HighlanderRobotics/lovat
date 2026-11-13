import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { getTeamsInTournament } from "../../handler/manager/tournament/getTeamsInTournament.js";
import { getTeamRankings } from "../../handler/manager/tournament/getTeamRankings.js";
import { addScouterShift } from "../../handler/manager/tournament/addScouterShift.js";
import { getScouterSchedule } from "../../handler/manager/tournament/getScouterSchedule.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

router.use(requireAuth);

router.get("/:tournament/teams", getTeamsInTournament);

router.get("/:tournament/rankedTeams", getTeamRankings);

router.post("/:tournament/scoutershifts", requireVerifiedTeam, addScouterShift);

router.get(
  "/:tournament/scoutershifts",
  requireVerifiedTeam,
  getScouterSchedule,
);

export default router;

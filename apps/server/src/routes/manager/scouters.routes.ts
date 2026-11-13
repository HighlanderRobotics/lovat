import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { addNewScouter } from "../../handler/collection/addNewScouter.js";
import { archiveScouter } from "../../handler/manager/scouters/archiveScouter.js";
import { changeNameScouter } from "../../handler/manager/scouters/changeNameScouter.js";
import { checkCodeScouter } from "../../handler/collection/checkCodeScouter.js";
import { emailTeamCode } from "../../handler/manager/scouters/emailTeamCode.js";
import { getScheduleForScouter } from "../../handler/collection/getScheduleForScouter.js";
import { getScoutersOnTeam } from "../../handler/collection/getScoutersOnTeam.js";
import { getScouterTournaments } from "../../handler/collection/getScouterTournaments.js";
import { getTournamentForScouterWithSchedule } from "../../handler/manager/scouters/getTournamentForScouterWithSchedule.js";
import { unarchiveScouter } from "../../handler/manager/scouters/unarchiveScouter.js";
import { addScouterDashboard } from "../../handler/manager/scouters/addScouterDashboard.js";
import { scouterScoutReports } from "../../handler/analysis/scoutingLead/scouterScoutReports.js";
import { deleteScouter } from "../../handler/manager/scouters/deleteScouter.js";
import { scoutingLeadProgressPage } from "../../handler/manager/scouters/scoutingLeadProgressPage.js";
import { updateScouterName } from "../../handler/manager/scouters/updateScouterName.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

// Public/unauthenticated endpoints
router.post("/emailTeamCode", emailTeamCode);
router.get("/scouter/checkcode", checkCodeScouter);
router.post("/name/uuid/:uuid", changeNameScouter);
router.get("/scouters", getScoutersOnTeam);
router.post("/scouter", addNewScouter);

router.get("/scouters/:uuid/tournaments", getScouterTournaments);
router.get("/scouterschedules/:tournament", getScheduleForScouter);
router.get("/scouter/tournaments", getTournamentForScouterWithSchedule);

router.post(
  "/unarchive/uuid/:uuid",
  requireAuth,
  requireVerifiedTeam,
  unarchiveScouter,
);
router.post(
  "/archive/uuid/:uuid",
  requireAuth,
  requireVerifiedTeam,
  archiveScouter,
);

router.put("/scoutername", requireAuth, requireVerifiedTeam, updateScouterName);
router.delete(
  "/scouterdashboard",
  requireAuth,
  requireVerifiedTeam,
  deleteScouter,
);
router.get(
  "/scouterspage",
  requireAuth,
  requireVerifiedTeam,
  scoutingLeadProgressPage,
);
router.post(
  "/scouterdashboard",
  requireAuth,
  requireVerifiedTeam,
  addScouterDashboard,
);
router.get(
  "/scouterreports",
  requireAuth,
  requireVerifiedTeam,
  scouterScoutReports,
);

export default router;

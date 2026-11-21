import { Router } from "express";
import { addNewScouter } from "../../handler/collection/addNewScouter.js";
import { checkCodeScouter } from "../../handler/collection/checkCodeScouter.js";
import { getScoutersOnTeam } from "../../handler/collection/getScoutersOnTeam.js";
import { getScouterTournaments } from "../../handler/collection/getScouterTournaments.js";
import { getScheduleForScouter } from "../../handler/collection/getScheduleForScouter.js";
import { preMatch } from "../../handler/collection/preMatch.js";

import { startMatch } from "../../handler/collection/startMatch.js";
import { endMatch } from "../../handler/collection/endMatch.js";
import { submitReport } from "../../handler/collection/submitReport.js";

import { addScoutReport } from "../../handler/collection/addScoutReport.js";

import { trainingRoutes } from "../../handler/training/training.routes.js";

const router = Router();

router.use(trainingRoutes);

router.get("/checkcode", checkCodeScouter);

router.post("/scouter", addNewScouter);
router.get("/scouter", getScoutersOnTeam);

router.get("/tournament", getScouterTournaments);

router.get("/schedules/:tournament", getScheduleForScouter);

// Existing saved reports keep the legacy upload contract.
router.post("/scoutreports", addScoutReport);

router.post("/load", preMatch);
router.post("/load/:match/:team", preMatch);

router.post("/start", startMatch);
router.post("/end", endMatch);
router.post("/submit", submitReport);

// Training pairing will be added with its handler.

export default router;

import { alliancePageResponse } from "../../handler/analysis/predictions/alliancePageResponse.js";
import { matchPrediction } from "../../handler/analysis/predictions/matchPrediction.js";
import { picklistShell } from "../../handler/analysis/picklist/picklistShell.js";
import { pitDisplay } from "../../handler/manager/pitDisplay.js";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { Router } from "express";
import teamLookup from "./teamLookup.routes.js";
import csv from "./csv.routes.js";
import scoutReport from "./scoutreport.routes.js";
import { qualRankingPrediction } from "../../handler/analysis/predictions/qualRankingPrediction.js";

const router = Router();

router.get("/pitdisplay", pitDisplay);

router.use(requireAuth);

router.use(teamLookup);
router.use(csv);
router.use(scoutReport);

router.get("/alliance", alliancePageResponse);

router.get("/matchprediction", matchPrediction);
router.get("/qualrankingprediction", qualRankingPrediction);
router.get("/picklist", picklistShell);

export default router;

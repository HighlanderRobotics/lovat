import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { addScoutReport } from "../../handler/collection/addScoutReport.js";
import { deleteScoutReport } from "../../handler/manager/scoutreports/deleteScoutReport.js";
import { getScoutReport } from "../../handler/manager/scoutreports/getScoutReport.js";
import { setScoutReportFlag } from "../../handler/manager/scoutreports/setScoutReportFlag.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

router.post("/", addScoutReport);

router.use(requireAuth, requireVerifiedTeam);

router.post("/setflag/:report", setScoutReportFlag);

router.get("/:uuid", getScoutReport);
router.delete("/:uuid", deleteScoutReport);

export default router;

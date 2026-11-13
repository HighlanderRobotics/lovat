import { Router } from "express";
import { getReportCSV } from "../../handler/analysis/csv/getReportCSV.js";
import { getTeamCSV } from "../../handler/analysis/csv/getTeamCSV.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

router.use(requireVerifiedTeam);

router.get("/csvplain", getTeamCSV);
router.get("/reportcsv", getReportCSV);

export default router;

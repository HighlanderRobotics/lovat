import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { updateScouterShift } from "../../handler/manager/scoutershifts/updateScouterShift.js";
import { deleteScouterShift } from "../../handler/manager/scoutershifts/deleteScouterShift.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";
import { superScoutingSchedule } from "../../handler/manager/scoutershifts/generateSchedule.js";

const router = Router();
router.get("/generate", superScoutingSchedule);

router.use(requireAuth, requireVerifiedTeam);

router.post("/:uuid", updateScouterShift);

router.delete("/:uuid", deleteScouterShift);

export default router;

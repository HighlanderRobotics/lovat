import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { addMutablePicklist } from "../../handler/manager/mutablepicklists/addMutablePicklist.js";
import { deleteMutablePicklist } from "../../handler/manager/mutablepicklists/deleteMutablePicklist.js";
import { getMutablePicklists } from "../../handler/manager/mutablepicklists/getMutablePicklists.js";
import { getSingleMutablePicklist } from "../../handler/manager/mutablepicklists/getSingleMutablePicklist.js";
import { updateMutablePicklist } from "../../handler/manager/mutablepicklists/updateMutablePicklist.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

router.use(requireAuth, requireVerifiedTeam);

router.post("/", addMutablePicklist);
router.delete("/:uuid", deleteMutablePicklist);
router.get("/", getMutablePicklists);
router.get("/:uuid", getSingleMutablePicklist);
router.put("/:uuid", updateMutablePicklist);

export default router;

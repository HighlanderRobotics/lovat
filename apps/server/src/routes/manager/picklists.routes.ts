import { Router } from "express";
import { requireAuth } from "../../lib/middleware/requireAuth.js";
import { addPicklist } from "../../handler/manager/picklists/addPicklist.js";
import { deletePicklist } from "../../handler/manager/picklists/deletePicklist.js";
import { getPicklists } from "../../handler/manager/picklists/getPicklists.js";
import { getSinglePicklist } from "../../handler/manager/picklists/getSinglePicklist.js";
import { updatePicklist } from "../../handler/manager/picklists/updatePicklist.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

router.use(requireAuth, requireVerifiedTeam);

router.post("/", addPicklist);

router.get("/", getPicklists);

router.get("/:uuid", getSinglePicklist);

router.put("/:uuid", updatePicklist);

router.delete("/:uuid", deletePicklist);

export default router;

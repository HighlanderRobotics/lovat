import { Router } from "express";
import express from "express";

import { requireSlackToken } from "../../lib/middleware/requireSlackToken.js";
import { addSlackWorkspace } from "../../handler/slack/addSlackWorkspace.js";
import { processCommand } from "../../handler/slack/processCommands.js";
import { processEvent } from "../../handler/slack/processEvents.js";

/*

slack.routes.ts

GET    /slack/add-workspace
POST   /slack/command
POST   /slack/event

*/

const router = Router();

router.get("/add-workspace", addSlackWorkspace);

router.post(
  "/command",
  express.urlencoded({ extended: true }),
  requireSlackToken,
  processCommand,
);

router.post("/event", requireSlackToken, processEvent);

export default router;

import { Hono } from "hono";
import { requireLovatSignature } from "../middleware/requireLovatSignature";
import { TicketSource } from "@lovat/db";
import { addTicket } from "../handler/addTicket";

const router = new Hono();

router.post("/website", requireLovatSignature, async (c) => {
  addTicket(c, TicketSource.WEBSITE);
});

router.post("/dashboard", requireLovatSignature, async (c) => {
  addTicket(c, TicketSource.DASHBOARD);
});

export default router;

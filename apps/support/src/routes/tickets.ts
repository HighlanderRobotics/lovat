import { Hono } from "hono";
import { requireLovatSignature } from "../middleware/requireLovatSignature";
import { TicketSource } from "@lovat/db";
import { addTicket } from "../handler/addTicket";
import { closeTicket } from "../handler/closeTicket";

const router = new Hono();

router.post("/website", requireLovatSignature, async (c) => {
  return addTicket(c, TicketSource.WEBSITE);
});

router.post("/dashboard", requireLovatSignature, async (c) => {
  return addTicket(c, TicketSource.DASHBOARD);
});

router.post("/close/:id", async (c) => {
  return closeTicket(c);
});

export default router;

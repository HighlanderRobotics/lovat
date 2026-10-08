import type { Context } from "hono";
import { updateTicket } from "../services/tickets";
import { TicketStatus } from "@lovat/db";
import { updateTicketSlack } from "../services/slack";

export const closeTicket = async (c: Context) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Ticket ID is required" }, 400);
  }

  const ticket = await updateTicket(id, TicketStatus.RESOLVED);

  updateTicketSlack(ticket);

  return c.json(ticket, 201);
};

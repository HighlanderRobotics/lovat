import { db, type TicketSource } from "@lovat/db";
import type { Context } from "hono";
import { createTicket } from "../services/tickets";

export const addTicket = async (c: Context, source: TicketSource) => {
  const body = await c.req.json();

  let ticket;

  switch (source) {
    case "EMAIL":
    case "WEBSITE":
      ticket = createTicket({
        requesterEmail: body.email,
        requesterName: body.name,
        requesterTeam: body.team,
        body: body.message,
        source: source,
      });
      break;
    case "DASHBOARD":
      ticket = createTicket({
        requesterEmail: body.email,
        requesterName: body.name,
        requesterTeam: body.team,
        requesterId: body.id,
        body: body.message,
        source: source,
      });
      break;
    case "MANUAL":
  }

  return c.json(ticket, 201);
};

import { db, type TicketSource } from "@lovat/db";
import type { Context } from "hono";
import { createTicket } from "../services/tickets";

export const addTicket = async (c: Context, source: TicketSource) => {
  const body = await c.req.json();
  const requesterTeam =
    body.team == null || String(body.team).trim() === ""
      ? null
      : Number(body.team);
  if (
    requesterTeam !== null &&
    (!Number.isInteger(requesterTeam) || requesterTeam <= 0 || requesterTeam > 99999)
  ) {
    return c.json({ error: "Invalid team number" }, 400);
  }

  let ticket;

  switch (source) {
    case "EMAIL":
    case "WEBSITE":
      ticket = await createTicket({
        requesterEmail: body.email,
        requesterName: body.name,
        requesterTeam,
        body: body.message,
        source: source,
      });
      break;
    case "DASHBOARD":
      ticket = await createTicket({
        requesterEmail: body.email,
        requesterName: body.name,
        requesterTeam,
        requesterId: body.id,
        body: body.message,
        source: source,
      });
      break;
    case "MANUAL":
  }

  return c.json(ticket, 201);
};

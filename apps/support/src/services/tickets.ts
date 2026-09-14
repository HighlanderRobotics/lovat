import { db, TicketSource, TicketStatus } from "@lovat/db";

export async function createTicket(data: {
  requesterName: string;
  requesterEmail: string;
  requesterId?: string;
  requesterTeam?: string;
  subject?: string;
  body: string;
  source: TicketSource;
}) {
  return db.supportTicket.create({
    data: {
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
      requesterId: data.requesterId,
      requesterTeam: data.requesterTeam,
      subject: data.subject,
      body: data.body,
      status: "OPEN",
      source: data.source,
    },
  });
}

export async function getTicket(id: string) {
  return db.supportTicket.findUnique({
    where: { id },
  });
}

export async function updateTicket(id: string, status: TicketStatus) {
  return db.supportTicket.update({
    where: { id },
    data: {
      status,
    },
  });
}

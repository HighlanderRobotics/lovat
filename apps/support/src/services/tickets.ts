import { db, TicketSource, TicketStatus } from "@lovat/db";

export const createTicket = async (data: {
  requesterName: string;
  requesterEmail: string;
  requesterId?: string;
  requesterTeam?: number | null;
  subject?: string;
  body: string;
  source: TicketSource;
}) => {
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
};

export const getTicket = async (id: string) => {
  return db.supportTicket.findUnique({
    where: { id },
  });
};

export const updateTicket = async (id: string, status: TicketStatus) => {
  return db.supportTicket.update({
    where: { id },
    data: {
      status,
    },
  });
};

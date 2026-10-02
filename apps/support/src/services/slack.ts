import { db, TicketStatus, type SupportTicket } from "@lovat/db";
import { WebClient } from "@slack/web-api";

if (!process.env.SLACK_API_KEY) {
  throw new Error("SLACK_API_KEY is missing");
}
const slack = new WebClient(process.env.SLACK_API_KEY);

export const openTicket = async (ticket: SupportTicket) => {
  if (!process.env.LOVAT_COMMUNICATIONS_ID) {
    throw new Error("LOVAT_COMMUNICATIONS_ID is missing");
  }
  const message = await slack.chat.postMessage({
    channel: process.env.LOVAT_COMMUNICATIONS_ID,
    attachments: [ticketMessage(ticket)],
  });

  await db.supportTicket.update({
    where: {
      id: ticket.id,
    },
    data: {
      slackChannelId: message.channel,
      slackMessageTs: message.ts,
    },
  });

  return message;
};
export const updateTicketSlack = async (ticket: SupportTicket) => {
  if (!process.env.LOVAT_COMMUNICATIONS_ID) {
    throw new Error("LOVAT_COMMUNICATIONS_ID is missing");
  }
  if (!ticket.slackChannelId || !ticket.slackMessageTs) {
    return "NO_MESSAGE";
  }
  return await slack.chat.update({
    channel: ticket.slackChannelId,
    ts: ticket.slackMessageTs,
    attachments: [ticketMessage(ticket)],
  });
};

const ticketMessage = (ticket: SupportTicket) => {
  return {
    color: ticketStatusToColor[ticket.status],
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "New Support Ticket",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Ticket*\n${ticket.id}`,
          },
          {
            type: "mrkdwn",
            text: `*Status*\n:large_yellow_circle: ${ticket.status}`,
          },
          {
            type: "mrkdwn",
            text: `*Requester*\n${ticket.requesterName}`,
          },
          {
            type: "mrkdwn",
            text: `*Email*\n${ticket.requesterEmail}`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Subject*\n${ticket.subject ?? `Support Ticket ${ticket.id}`}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message*\n${ticket.body}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Respond",
            },
            action_id: "respond",
            url: `mailto:${ticket.requesterEmail ?? "lovat@frc8033.com"}`,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Resolve",
            },
            style: "primary",
            action_id: "resolve_ticket",
          },
        ],
      },
    ],
  };
};

const ticketStatusToColor: Record<TicketStatus, string> = {
  OPEN: "#5865F2",
  NEEDS_REPLY: "#f1f50b",
  RESOLVED: "#c52222",
  NO_ACTION_NEEDED: "#2fff00",
};

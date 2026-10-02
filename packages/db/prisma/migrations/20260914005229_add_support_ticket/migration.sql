-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'RESOLVED', 'NEEDS_REPLY', 'NO_ACTION_NEEDED');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('EMAIL', 'WEBSITE', 'DASHBOARD', 'MANUAL');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "source" "TicketSource" NOT NULL,
    "requesterId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "linearIssue" TEXT,
    "slackChannelId" TEXT,
    "slackMessageTs" TEXT,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

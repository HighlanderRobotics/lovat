/*
  Warnings:

  - Added the required column `requesterTeam` to the `SupportTicket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "requesterTeam" INTEGER NOT NULL;

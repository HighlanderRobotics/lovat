/*
  Warnings:

  - Added the required column `requesterName` to the `SupportTicket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "requesterName" TEXT NOT NULL;

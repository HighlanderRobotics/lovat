-- CreateEnum
CREATE TYPE "ReportReliability" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FLAGGED', 'BAD_REPORT');

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "reliability" "ReportReliability" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateTable
CREATE TABLE "_ReportFlags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReportFlags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ReportFlags_B_index" ON "_ReportFlags"("B");

-- AddForeignKey
ALTER TABLE "_ReportFlags" ADD CONSTRAINT "_ReportFlags_A_fkey" FOREIGN KEY ("A") REFERENCES "ScoutReport"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReportFlags" ADD CONSTRAINT "_ReportFlags_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

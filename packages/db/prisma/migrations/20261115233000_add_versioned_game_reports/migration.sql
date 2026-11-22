CREATE TABLE "GameReport" (
  "uuid" TEXT NOT NULL PRIMARY KEY,
  "scouterUuid" TEXT NOT NULL,
  "teamMatchKey" TEXT NOT NULL,
  "seasonYear" INTEGER NOT NULL,
  "gameId" TEXT NOT NULL,
  "gameVersion" INTEGER NOT NULL,
  "reportVersion" INTEGER NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "data" JSONB NOT NULL,
  "training" BOOLEAN NOT NULL DEFAULT false,
  "reliability" "ReportReliability" NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameReport_scouterUuid_fkey" FOREIGN KEY ("scouterUuid") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GameReport_teamMatchKey_fkey" FOREIGN KEY ("teamMatchKey") REFERENCES "TeamMatchData"("key") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GameReport_seasonYear_fkey" FOREIGN KEY ("seasonYear") REFERENCES "Season"("year") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GameReport_versions_check" CHECK ("gameVersion">0 AND "reportVersion">0),
  CONSTRAINT "GameReport_time_check" CHECK ("endTime">="startTime")
);
CREATE INDEX "GameReport_scouterUuid_idx" ON "GameReport"("scouterUuid");
CREATE INDEX "GameReport_teamMatchKey_idx" ON "GameReport"("teamMatchKey");
CREATE INDEX "GameReport_seasonYear_gameId_gameVersion_idx" ON "GameReport"("seasonYear","gameId","gameVersion");

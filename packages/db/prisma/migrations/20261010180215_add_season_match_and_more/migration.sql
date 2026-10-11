-- Apply schema changes and the parent-team backfill atomically.
BEGIN;

-- Older scouting slots did not require a Team row. Preserve those slots and
-- their reports using an explicit number-only fallback, not invented metadata.
-- A later official team import replaces the fallback name.
INSERT INTO "Team" ("number", "name")
SELECT DISTINCT slots."teamNumber", 'Team ' || slots."teamNumber"::text
FROM "TeamMatchData" AS slots
WHERE NOT EXISTS (
    SELECT 1 FROM "Team" AS teams WHERE teams."number" = slots."teamNumber"
)
ON CONFLICT ("number") DO NOTHING;
-- CreateEnum
CREATE TYPE "AllianceColor" AS ENUM ('RED', 'BLUE');

-- CreateEnum
CREATE TYPE "CompetitionLevel" AS ENUM ('QUALIFICATION', 'EIGHTHFINAL', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "TeamMatchData" ADD COLUMN     "alliance" "AllianceColor",
ADD COLUMN     "disqualified" BOOLEAN,
ADD COLUMN     "externalParticipantKey" TEXT,
ADD COLUMN     "matchKey" TEXT,
ADD COLUMN     "station" INTEGER,
ADD COLUMN     "surrogate" BOOLEAN;

-- Prisma cannot express CHECK constraints; keep this rule in migration SQL.
ALTER TABLE "TeamMatchData" ADD CONSTRAINT "TeamMatchData_station_check"
CHECK ("station" IS NULL OR "station" BETWEEN 1 AND 3);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "districtSeasonKey" TEXT,
ADD COLUMN     "endDate" DATE,
ADD COLUMN     "eventType" INTEGER,
ADD COLUMN     "officialDataRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "officialDataUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "parentTournamentKey" TEXT,
ADD COLUMN     "playoffType" INTEGER,
ADD COLUMN     "seasonYear" INTEGER,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "Season" (
    "year" INTEGER NOT NULL,
    "gameName" TEXT,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "DistrictSeason" (
    "key" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DistrictSeason_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TeamSeason" (
    "teamNumber" INTEGER NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "stateProvince" TEXT,
    "country" TEXT,
    "districtSeasonKey" TEXT,

    CONSTRAINT "TeamSeason_pkey" PRIMARY KEY ("teamNumber","seasonYear")
);

-- CreateTable
CREATE TABLE "TeamTournament" (
    "teamNumber" INTEGER NOT NULL,
    "tournamentKey" TEXT NOT NULL,

    CONSTRAINT "TeamTournament_pkey" PRIMARY KEY ("teamNumber","tournamentKey")
);

-- CreateTable
CREATE TABLE "Match" (
    "key" TEXT NOT NULL,
    "tournamentKey" TEXT NOT NULL,
    "competitionLevel" "CompetitionLevel" NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "displayOrder" INTEGER,
    "scheduledTime" TIMESTAMP(3),
    "predictedTime" TIMESTAMP(3),
    "actualTime" TIMESTAMP(3),
    "postResultTime" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winningAlliance" "AllianceColor",

    CONSTRAINT "Match_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MatchAlliance" (
    "matchKey" TEXT NOT NULL,
    "color" "AllianceColor" NOT NULL,
    "score" INTEGER,
    "scoreBreakdown" JSONB,

    CONSTRAINT "MatchAlliance_pkey" PRIMARY KEY ("matchKey","color")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistrictSeason_seasonYear_abbreviation_key" ON "DistrictSeason"("seasonYear", "abbreviation");

-- CreateIndex
CREATE INDEX "TeamSeason_districtSeasonKey_idx" ON "TeamSeason"("districtSeasonKey");

-- CreateIndex
CREATE INDEX "TeamTournament_tournamentKey_idx" ON "TeamTournament"("tournamentKey");

-- CreateIndex
CREATE INDEX "Match_tournamentKey_displayOrder_idx" ON "Match"("tournamentKey", "displayOrder");

-- CreateIndex
CREATE INDEX "Match_tournamentKey_scheduledTime_idx" ON "Match"("tournamentKey", "scheduledTime");

-- CreateIndex
CREATE UNIQUE INDEX "Match_tournamentKey_competitionLevel_setNumber_matchNumber_key" ON "Match"("tournamentKey", "competitionLevel", "setNumber", "matchNumber");

-- CreateIndex
CREATE INDEX "TeamMatchData_matchKey_teamNumber_idx" ON "TeamMatchData"("matchKey", "teamNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMatchData_matchKey_alliance_station_key" ON "TeamMatchData"("matchKey", "alliance", "station");

-- CreateIndex
CREATE INDEX "Tournament_seasonYear_startDate_idx" ON "Tournament"("seasonYear", "startDate");

-- CreateIndex
CREATE INDEX "Tournament_districtSeasonKey_idx" ON "Tournament"("districtSeasonKey");

-- CreateIndex
CREATE INDEX "Tournament_parentTournamentKey_idx" ON "Tournament"("parentTournamentKey");

-- AddForeignKey
ALTER TABLE "DistrictSeason" ADD CONSTRAINT "DistrictSeason_seasonYear_fkey" FOREIGN KEY ("seasonYear") REFERENCES "Season"("year") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeason" ADD CONSTRAINT "TeamSeason_teamNumber_fkey" FOREIGN KEY ("teamNumber") REFERENCES "Team"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeason" ADD CONSTRAINT "TeamSeason_seasonYear_fkey" FOREIGN KEY ("seasonYear") REFERENCES "Season"("year") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeason" ADD CONSTRAINT "TeamSeason_districtSeasonKey_fkey" FOREIGN KEY ("districtSeasonKey") REFERENCES "DistrictSeason"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonYear_fkey" FOREIGN KEY ("seasonYear") REFERENCES "Season"("year") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_districtSeasonKey_fkey" FOREIGN KEY ("districtSeasonKey") REFERENCES "DistrictSeason"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_parentTournamentKey_fkey" FOREIGN KEY ("parentTournamentKey") REFERENCES "Tournament"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTournament" ADD CONSTRAINT "TeamTournament_teamNumber_fkey" FOREIGN KEY ("teamNumber") REFERENCES "Team"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTournament" ADD CONSTRAINT "TeamTournament_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAlliance" ADD CONSTRAINT "MatchAlliance_matchKey_fkey" FOREIGN KEY ("matchKey") REFERENCES "Match"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMatchData" ADD CONSTRAINT "TeamMatchData_teamNumber_fkey" FOREIGN KEY ("teamNumber") REFERENCES "Team"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMatchData" ADD CONSTRAINT "TeamMatchData_matchKey_fkey" FOREIGN KEY ("matchKey") REFERENCES "Match"("key") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

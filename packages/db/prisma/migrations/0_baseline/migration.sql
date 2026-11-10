-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('LEFT_TRENCH', 'LEFT_BUMP', 'HUB', 'RIGHT_TRENCH', 'RIGHT_BUMP', 'NEUTRAL_ZONE', 'DEPOT', 'OUTPOST', 'NONE');

-- CreateEnum
CREATE TYPE "EventAction" AS ENUM ('START_SCORING', 'STOP_SCORING', 'START_MATCH', 'START_CAMPING', 'STOP_CAMPING', 'START_DEFENDING', 'STOP_DEFENDING', 'INTAKE', 'OUTTAKE', 'DISRUPT', 'CROSS', 'CLIMB', 'START_FEEDING', 'STOP_FEEDING');

-- CreateEnum
CREATE TYPE "FieldTraversal" AS ENUM ('TRENCH', 'BUMP', 'BOTH', 'NONE');

-- CreateEnum
CREATE TYPE "Beached" AS ENUM ('ON_FUEL', 'ON_BUMP', 'BOTH', 'NEITHER');

-- CreateEnum
CREATE TYPE "EndgameClimb" AS ENUM ('NOT_ATTEMPTED', 'FAILED', 'L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "ClimbPosition" AS ENUM ('SIDE', 'MIDDLE');

-- CreateEnum
CREATE TYPE "ClimbSide" AS ENUM ('FRONT', 'BACK');

-- CreateEnum
CREATE TYPE "AutoClimb" AS ENUM ('NOT_ATTEMPTED', 'FAILED', 'SUCCEEDED');

-- CreateEnum
CREATE TYPE "FeederType" AS ENUM ('CONTINUOUS', 'STOP_TO_SHOOT', 'DUMP');

-- CreateEnum
CREATE TYPE "IntakeType" AS ENUM ('GROUND', 'OUTPOST', 'BOTH', 'NEITHER');

-- CreateEnum
CREATE TYPE "RobotRole" AS ENUM ('CYCLING', 'SCORING', 'FEEDING', 'DEFENDING', 'IMMOBILE');

-- CreateEnum
CREATE TYPE "WarningType" AS ENUM ('BREAK');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ANALYST', 'SCOUTING_LEAD');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('QUALIFICATION', 'ELIMINATION');

-- CreateTable
CREATE TABLE "Event" (
    "eventUuid" TEXT NOT NULL,
    "time" DOUBLE PRECISION NOT NULL,
    "action" "EventAction" NOT NULL,
    "position" "Position" NOT NULL,
    "points" INTEGER NOT NULL,
    "quantity" INTEGER,
    "scoutReportUuid" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("eventUuid")
);

-- CreateTable
CREATE TABLE "FeatureToggle" (
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FeatureToggle_pkey" PRIMARY KEY ("feature")
);

-- CreateTable
CREATE TABLE "TeamMatchData" (
    "key" TEXT NOT NULL,
    "tournamentKey" TEXT NOT NULL,
    "matchNumber" SMALLINT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "matchType" "MatchType" NOT NULL,

    CONSTRAINT "TeamMatchData_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MutablePicklist" (
    "uuid" TEXT NOT NULL,
    "teams" INTEGER[],
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tournamentKey" TEXT,

    CONSTRAINT "MutablePicklist_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ScoutReport" (
    "uuid" TEXT NOT NULL,
    "teamMatchKey" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL,
    "robotRoles" "RobotRole"[],
    "driverAbility" INTEGER NOT NULL,
    "scouterUuid" TEXT NOT NULL,
    "robotBrokeDescription" TEXT,
    "accuracy" INTEGER,
    "beached" "Beached" NOT NULL,
    "climbPosition" "ClimbPosition",
    "climbSide" "ClimbSide",
    "defenseEffectiveness" INTEGER NOT NULL,
    "feederTypes" "FeederType"[],
    "intakeType" "IntakeType" NOT NULL,
    "fieldTraversal" "FieldTraversal" NOT NULL,
    "scoresWhileMoving" BOOLEAN NOT NULL,
    "disrupts" BOOLEAN NOT NULL,
    "endgameClimb" "EndgameClimb" NOT NULL,
    "autoClimb" "AutoClimb" NOT NULL,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "ScouterScheduleShift" (
    "uuid" TEXT NOT NULL,
    "sourceTeamNumber" INTEGER NOT NULL,
    "tournamentKey" TEXT NOT NULL,
    "startMatchOrdinalNumber" INTEGER NOT NULL,
    "endMatchOrdinalNumber" INTEGER NOT NULL,

    CONSTRAINT "ScouterScheduleShift_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Scouter" (
    "uuid" TEXT NOT NULL,
    "name" TEXT,
    "sourceTeamNumber" INTEGER NOT NULL,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "scouterReliability" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Scouter_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SharedPicklist" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "autoPoints" DOUBLE PRECISION NOT NULL,
    "teleopPoints" DOUBLE PRECISION NOT NULL,
    "authorId" TEXT NOT NULL,
    "autoClimb" DOUBLE PRECISION NOT NULL,
    "campingDefenseTime" DOUBLE PRECISION NOT NULL,
    "climbResult" DOUBLE PRECISION NOT NULL,
    "contactDefenseTime" DOUBLE PRECISION NOT NULL,
    "driverAbility" DOUBLE PRECISION NOT NULL,
    "defenseEffectiveness" DOUBLE PRECISION NOT NULL,
    "estimatedSuccessfulFuelRate" DOUBLE PRECISION NOT NULL,
    "estimatedTotalFuelScored" DOUBLE PRECISION NOT NULL,
    "feedingRate" DOUBLE PRECISION NOT NULL,
    "scoringRate" DOUBLE PRECISION NOT NULL,
    "totalDefensiveTime" DOUBLE PRECISION NOT NULL,
    "totalFuelFed" DOUBLE PRECISION NOT NULL,
    "totalFuelThroughput" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SharedPicklist_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Team" (
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "RegisteredTeam" (
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "timeCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamApproved" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,

    CONSTRAINT "RegisteredTeam_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "EmailVerificationRequest" (
    "verificationCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "teamNumber" INTEGER NOT NULL,

    CONSTRAINT "EmailVerificationRequest_pkey" PRIMARY KEY ("verificationCode")
);

-- CreateTable
CREATE TABLE "SlackWorkspace" (
    "workspaceId" TEXT NOT NULL,
    "owner" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,

    CONSTRAINT "SlackWorkspace_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "SlackSubscription" (
    "subscriptionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscribedEvent" "WarningType" NOT NULL,

    CONSTRAINT "SlackSubscription_pkey" PRIMARY KEY ("subscriptionId")
);

-- CreateTable
CREATE TABLE "SlackNotificationThread" (
    "messageId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "SlackNotificationThread_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "date" TEXT,
    "latestFetchETag" TEXT,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "teamNumber" INTEGER,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
    "teamSourceRule" JSONB NOT NULL DEFAULT '{"mode": "EXCLUDE", "items": []}',
    "tournamentSourceRule" JSONB NOT NULL DEFAULT '{"mode": "EXCLUDE", "items": []}',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "uuid" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "CachedAnalysis" (
    "key" TEXT NOT NULL,
    "teamDependencies" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tournamentDependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CachedAnalysis_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_Team1" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team1_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Team2" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team2_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Team3" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team3_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Team4" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team4_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Team5" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team5_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Team6" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Team6_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Event_scoutReportUuid_idx" ON "Event"("scoutReportUuid");

-- CreateIndex
CREATE INDEX "TeamMatchData_tournamentKey_teamNumber_idx" ON "TeamMatchData"("tournamentKey", "teamNumber");

-- CreateIndex
CREATE INDEX "Scouter_sourceTeamNumber_idx" ON "Scouter"("sourceTeamNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredTeam_code_key" ON "RegisteredTeam"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_uuid_key" ON "ApiKey"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "_Team1_B_index" ON "_Team1"("B");

-- CreateIndex
CREATE INDEX "_Team2_B_index" ON "_Team2"("B");

-- CreateIndex
CREATE INDEX "_Team3_B_index" ON "_Team3"("B");

-- CreateIndex
CREATE INDEX "_Team4_B_index" ON "_Team4"("B");

-- CreateIndex
CREATE INDEX "_Team5_B_index" ON "_Team5"("B");

-- CreateIndex
CREATE INDEX "_Team6_B_index" ON "_Team6"("B");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_scoutReportUuid_fkey" FOREIGN KEY ("scoutReportUuid") REFERENCES "ScoutReport"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMatchData" ADD CONSTRAINT "TeamMatchData_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutablePicklist" ADD CONSTRAINT "MutablePicklist_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutablePicklist" ADD CONSTRAINT "MutablePicklist_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_scouterUuid_fkey" FOREIGN KEY ("scouterUuid") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_teamMatchKey_fkey" FOREIGN KEY ("teamMatchKey") REFERENCES "TeamMatchData"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScouterScheduleShift" ADD CONSTRAINT "ScouterScheduleShift_sourceTeamNumber_fkey" FOREIGN KEY ("sourceTeamNumber") REFERENCES "RegisteredTeam"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScouterScheduleShift" ADD CONSTRAINT "ScouterScheduleShift_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scouter" ADD CONSTRAINT "Scouter_sourceTeamNumber_fkey" FOREIGN KEY ("sourceTeamNumber") REFERENCES "RegisteredTeam"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPicklist" ADD CONSTRAINT "SharedPicklist_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredTeam" ADD CONSTRAINT "RegisteredTeam_number_fkey" FOREIGN KEY ("number") REFERENCES "Team"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackWorkspace" ADD CONSTRAINT "SlackWorkspace_owner_fkey" FOREIGN KEY ("owner") REFERENCES "RegisteredTeam"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackSubscription" ADD CONSTRAINT "SlackSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackNotificationThread" ADD CONSTRAINT "SlackNotificationThread_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SlackSubscription"("subscriptionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamNumber_fkey" FOREIGN KEY ("teamNumber") REFERENCES "RegisteredTeam"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team1" ADD CONSTRAINT "_Team1_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team1" ADD CONSTRAINT "_Team1_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team2" ADD CONSTRAINT "_Team2_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team2" ADD CONSTRAINT "_Team2_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team3" ADD CONSTRAINT "_Team3_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team3" ADD CONSTRAINT "_Team3_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team4" ADD CONSTRAINT "_Team4_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team4" ADD CONSTRAINT "_Team4_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team5" ADD CONSTRAINT "_Team5_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team5" ADD CONSTRAINT "_Team5_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team6" ADD CONSTRAINT "_Team6_A_fkey" FOREIGN KEY ("A") REFERENCES "Scouter"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Team6" ADD CONSTRAINT "_Team6_B_fkey" FOREIGN KEY ("B") REFERENCES "ScouterScheduleShift"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;


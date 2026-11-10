-- Derived only from replaying the two existing migrations and comparing them
-- with this branch's schema.prisma. No developer database was introspected.
-- The previous season's measurements cannot be mapped to this season's fields.
-- Refuse to discard populated reports/picklists or fabricate replacement values.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "Event", "ScoutReport", "SharedPicklist", "User" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Event")
     OR EXISTS (SELECT 1 FROM "ScoutReport")
     OR EXISTS (SELECT 1 FROM "SharedPicklist") THEN
    RAISE EXCEPTION 'Legacy season data exists. Archive or migrate Event, ScoutReport, and SharedPicklist data with a reviewed plan before applying 20260913000000_reconcile_current_schema. No schema changes were applied.';
  END IF;
END $$;

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
CREATE TYPE "WarningType" AS ENUM ('BREAK');

-- AlterEnum
CREATE TYPE "EventAction_new" AS ENUM ('START_SCORING', 'STOP_SCORING', 'START_MATCH', 'START_CAMPING', 'STOP_CAMPING', 'START_DEFENDING', 'STOP_DEFENDING', 'INTAKE', 'OUTTAKE', 'DISRUPT', 'CROSS', 'CLIMB', 'START_FEEDING', 'STOP_FEEDING');
ALTER TABLE "Event" ALTER COLUMN "action" TYPE "EventAction_new" USING ("action"::text::"EventAction_new");
ALTER TYPE "EventAction" RENAME TO "EventAction_old";
ALTER TYPE "EventAction_new" RENAME TO "EventAction";
DROP TYPE "public"."EventAction_old";

-- AlterEnum
CREATE TYPE "Position_new" AS ENUM ('LEFT_TRENCH', 'LEFT_BUMP', 'HUB', 'RIGHT_TRENCH', 'RIGHT_BUMP', 'NEUTRAL_ZONE', 'DEPOT', 'OUTPOST', 'NONE');
ALTER TABLE "Event" ALTER COLUMN "position" TYPE "Position_new" USING ("position"::text::"Position_new");
ALTER TYPE "Position" RENAME TO "Position_old";
ALTER TYPE "Position_new" RENAME TO "Position";
DROP TYPE "public"."Position_old";

-- AlterEnum
CREATE TYPE "RobotRole_new" AS ENUM ('CYCLING', 'SCORING', 'FEEDING', 'DEFENDING', 'IMMOBILE');
ALTER TABLE "ScoutReport" ALTER COLUMN "robotRoles" TYPE "RobotRole_new"[] USING ("robotRoles"::text::"RobotRole_new"[]);
ALTER TYPE "RobotRole" RENAME TO "RobotRole_old";
ALTER TYPE "RobotRole_new" RENAME TO "RobotRole";
DROP TYPE "public"."RobotRole_old";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "points" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "RegisteredTeam" ADD COLUMN     "timeCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ScoutReport" DROP COLUMN "algaePickup",
DROP COLUMN "climbResult",
DROP COLUMN "coralPickup",
DROP COLUMN "knocksAlgae",
DROP COLUMN "underShallowCage",
ADD COLUMN     "accuracy" INTEGER,
ADD COLUMN     "autoClimb" "AutoClimb" NOT NULL,
ADD COLUMN     "beached" "Beached" NOT NULL,
ADD COLUMN     "climbPosition" "ClimbPosition",
ADD COLUMN     "climbSide" "ClimbSide",
ADD COLUMN     "defenseEffectiveness" INTEGER NOT NULL,
ADD COLUMN     "disrupts" BOOLEAN NOT NULL,
ADD COLUMN     "endgameClimb" "EndgameClimb" NOT NULL,
ADD COLUMN     "feederTypes" "FeederType"[],
ADD COLUMN     "fieldTraversal" "FieldTraversal" NOT NULL,
ADD COLUMN     "intakeType" "IntakeType" NOT NULL,
ADD COLUMN     "robotBrokeDescription" TEXT,
ADD COLUMN     "scoresWhileMoving" BOOLEAN NOT NULL;

-- AlterTable
ALTER TABLE "Scouter" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SharedPicklist" DROP COLUMN "algaeNet",
DROP COLUMN "algaePickups",
DROP COLUMN "algaeProcessor",
DROP COLUMN "climb",
DROP COLUMN "coralLevel1Scores",
DROP COLUMN "coralLevel2Scores",
DROP COLUMN "coralLevel3Scores",
DROP COLUMN "coralLevel4Scores",
DROP COLUMN "coralPickups",
DROP COLUMN "defense",
DROP COLUMN "feeds",
ADD COLUMN     "autoClimb" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "campingDefenseTime" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "climbResult" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "contactDefenseTime" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "defenseEffectiveness" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "estimatedSuccessfulFuelRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "estimatedTotalFuelScored" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "feedingRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "scoringRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalDefensiveTime" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalFuelFed" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalFuelThroughput" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "latestFetchETag" TEXT;

-- Preserve the old explicit source allowlists before dropping their columns.
-- INCLUDE keeps existing visibility rather than widening it to all sources.
ALTER TABLE "User"
ADD COLUMN "teamSourceRule" JSONB NOT NULL DEFAULT '{"mode": "EXCLUDE", "items": []}',
ADD COLUMN "tournamentSourceRule" JSONB NOT NULL DEFAULT '{"mode": "EXCLUDE", "items": []}';
UPDATE "User" SET
  "teamSourceRule" = jsonb_build_object('mode', 'INCLUDE', 'items', COALESCE(to_jsonb("teamSource"), '[]'::jsonb)),
  "tournamentSourceRule" = jsonb_build_object('mode', 'INCLUDE', 'items', COALESCE(to_jsonb("tournamentSource"), '[]'::jsonb));
ALTER TABLE "User" DROP COLUMN "teamSource", DROP COLUMN "tournamentSource";

-- AlterTable
ALTER TABLE "_Team1" ADD CONSTRAINT "_Team1_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team1_AB_unique";

-- AlterTable
ALTER TABLE "_Team2" ADD CONSTRAINT "_Team2_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team2_AB_unique";

-- AlterTable
ALTER TABLE "_Team3" ADD CONSTRAINT "_Team3_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team3_AB_unique";

-- AlterTable
ALTER TABLE "_Team4" ADD CONSTRAINT "_Team4_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team4_AB_unique";

-- AlterTable
ALTER TABLE "_Team5" ADD CONSTRAINT "_Team5_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team5_AB_unique";

-- AlterTable
ALTER TABLE "_Team6" ADD CONSTRAINT "_Team6_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_Team6_AB_unique";

-- DropEnum
DROP TYPE "AlgaePickup";

-- DropEnum
DROP TYPE "CoralPickup";

-- DropEnum
DROP TYPE "KnocksAlgae";

-- DropEnum
DROP TYPE "UnderShallowCage";

-- DropEnum
DROP TYPE "climbResult";

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

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_uuid_key" ON "ApiKey"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- AddForeignKey
ALTER TABLE "SlackWorkspace" ADD CONSTRAINT "SlackWorkspace_owner_fkey" FOREIGN KEY ("owner") REFERENCES "RegisteredTeam"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackSubscription" ADD CONSTRAINT "SlackSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackNotificationThread" ADD CONSTRAINT "SlackNotificationThread_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SlackSubscription"("subscriptionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

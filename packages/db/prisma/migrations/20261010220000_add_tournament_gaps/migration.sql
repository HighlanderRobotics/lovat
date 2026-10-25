BEGIN;

CREATE TYPE "TournamentGapType" AS ENUM ('LUNCH', 'OVERNIGHT', 'PLAYOFF_TRANSITION', 'DELAY', 'BREAK');
CREATE TYPE "TournamentGapTimingSource" AS ENUM ('ACTUAL', 'SCHEDULED', 'PREDICTED');

CREATE UNIQUE INDEX "Match_key_tournamentKey_key" ON "Match"("key", "tournamentKey");

CREATE TABLE "TournamentGap" (
    "tournamentKey" TEXT NOT NULL,
    "afterMatchKey" TEXT NOT NULL,
    "beforeMatchKey" TEXT NOT NULL,
    "type" "TournamentGapType" NOT NULL,
    "timingSource" "TournamentGapTimingSource" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentGap_pkey" PRIMARY KEY ("afterMatchKey", "beforeMatchKey"),
    CONSTRAINT "TournamentGap_positive_interval" CHECK ("endTime" > "startTime"),
    CONSTRAINT "TournamentGap_distinct_matches" CHECK ("afterMatchKey" <> "beforeMatchKey"),
    CONSTRAINT "TournamentGap_tournamentKey_fkey" FOREIGN KEY ("tournamentKey") REFERENCES "Tournament"("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentGap_afterMatchKey_tournamentKey_fkey" FOREIGN KEY ("afterMatchKey", "tournamentKey") REFERENCES "Match"("key", "tournamentKey") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentGap_beforeMatchKey_tournamentKey_fkey" FOREIGN KEY ("beforeMatchKey", "tournamentKey") REFERENCES "Match"("key", "tournamentKey") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TournamentGap_tournamentKey_startTime_idx" ON "TournamentGap"("tournamentKey", "startTime");

COMMIT;

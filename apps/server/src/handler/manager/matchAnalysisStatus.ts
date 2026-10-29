import prisma from "../../prismaClient.js";
import type { DataSourceRule } from "../analysis/dataSourceRule.js";

export async function matchAnalysisStatus(
  tournament: string,
  sources: DataSourceRule<number>,
  db: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<{ key: string; ocrAnalyzed: boolean; fullyScouted: boolean }[]> {
  return db.$queryRaw<
    { key: string; ocrAnalyzed: boolean; fullyScouted: boolean }[]
  >`
    SELECT m.key,
      (EXISTS (SELECT 1 FROM "ScoreboardOcr" o WHERE o."matchKey"=m.key AND o.status IN ('VALIDATED','PARTIAL') AND o."analyzedAt" IS NOT NULL)
       OR EXISTS (SELECT 1 FROM "EstimatedScore" e WHERE e."matchKey"=m.key
        AND cardinality(e."sourceTeams")>0 AND
        ((${sources.mode}='INCLUDE' AND e."sourceTeams" <@ ${sources.items}::integer[])
        OR (${sources.mode}='EXCLUDE' AND NOT(e."sourceTeams" && ${sources.items}::integer[]))))) AS "ocrAnalyzed",
      ((SELECT count(*) FROM "TeamMatchData" t WHERE t."matchKey"=m.key)=6
       AND (SELECT count(DISTINCT t."teamNumber") FROM "TeamMatchData" t WHERE t."matchKey"=m.key
         AND EXISTS (SELECT 1 FROM "ScoutReport" r JOIN "Scouter" s ON s.uuid=r."scouterUuid"
           WHERE r."teamMatchKey"=t.key AND NOT r."analysisExcluded"
           AND ((${sources.mode}='INCLUDE' AND s."sourceTeamNumber"=ANY(${sources.items}::integer[]))
           OR (${sources.mode}='EXCLUDE' AND NOT(s."sourceTeamNumber"=ANY(${sources.items}::integer[]))))))=6) AS "fullyScouted"
    FROM "Match" m WHERE m."tournamentKey"=${tournament}
  `;
}

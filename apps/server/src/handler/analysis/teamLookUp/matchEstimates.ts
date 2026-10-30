import z from "zod";
import type { User } from "@lovat/db";
import prisma from "../../../prismaClient.js";
import { createAnalysisHandler } from "../analysisHandler.js";
import { dataSourceRuleSchema } from "../dataSourceRule.js";
import { readEstimatedScoreRows } from "../predictions/estimatedScoreRows.js";

export const ocrMatchParams = z.object({
  matchKey: z
    .string()
    .regex(/^2026[a-z0-9]+_(?:qm[1-9]\d*|(?:ef|qf|sf|f)[1-9]\d*m[1-9]\d*)$/),
});
const sampleSchema = z.object({
  time: z.number().int().min(0).max(163),
  count: z.number().int().min(0).max(1000),
  confidence: z.number().min(85).max(100),
});
const samplesSchema = z
  .array(sampleSchema)
  .max(600)
  .refine((rows) =>
    rows.every((r, i) => i === 0 || r.time > rows[i - 1]!.time),
  );
export const ocrMatchResponse = z.object({
  available: z.boolean(),
  matchKey: z.string(),
  label: z.string().optional(),
  tournamentName: z.string().optional(),
  status: z.string().optional(),
  redScore: z.number().nullable().optional(),
  blueScore: z.number().nullable().optional(),
  timeline: z
    .object({ red: z.array(sampleSchema), blue: z.array(sampleSchema) })
    .optional(),
  teams: z
    .array(
      z.object({
        teamNumber: z.number(),
        alliance: z.enum(["RED", "BLUE"]),
        scoutAverage: z.number().nullable(),
        ocrAdjustment: z.number().nullable(),
        totalPoints: z.number().nullable(),
      }),
    )
    .optional(),
});
export function readOcrTimeline(
  observations: unknown,
  channels: unknown,
): { red: z.infer<typeof samplesSchema>; blue: z.infer<typeof samplesSchema> } {
  const parsed = z
    .object({ red: samplesSchema, blue: samplesSchema })
    .safeParse(channels);
  if (channels !== null && channels !== undefined)
    return parsed.success ? parsed.data : { red: [], blue: [] };
  const paired = z
    .array(
      z.object({
        time: z.number(),
        red: z.number(),
        blue: z.number(),
        confidence: z.number(),
      }),
    )
    .max(600)
    .safeParse(observations);
  if (!paired.success) return { red: [], blue: [] };
  const color = (key: "red" | "blue") =>
    samplesSchema.safeParse(
      paired.data.map((r) => ({
        time: r.time,
        count: r[key],
        confidence: r.confidence,
      })),
    );
  const red = color("red"),
    blue = color("blue");
  return {
    red: red.success ? red.data : [],
    blue: blue.success ? blue.data : [],
  };
}
export async function matchEstimateDetails(
  user: User,
  matchKey: string,
  db: Pick<typeof prisma, "match" | "$queryRaw"> = prisma,
): Promise<z.infer<typeof ocrMatchResponse>> {
  const unavailable = { available: false, matchKey };
  const tournaments = dataSourceRuleSchema(z.string()).parse(
    user.tournamentSourceRule,
  );
  const tournamentKey = matchKey.split("_")[0]!;
  if (
    tournaments.mode === "INCLUDE"
      ? !tournaments.items.includes(tournamentKey)
      : tournaments.items.includes(tournamentKey)
  )
    return unavailable;
  const match = await db.match.findUnique({
    where: { key: matchKey },
    include: {
      tournament: { select: { name: true } },
      scoreboardOcr: true,
      alliances: true,
      teamSlots: {
        select: { teamNumber: true, alliance: true, station: true },
      },
    },
  });
  if (
    !match?.scoreboardOcr ||
    !["VALIDATED", "PARTIAL"].includes(match.scoreboardOcr.status)
  )
    return unavailable;
  const timeline = readOcrTimeline(
    match.scoreboardOcr.observations,
    match.scoreboardOcr.channels,
  );
  if (!timeline.red.length && !timeline.blue.length) return unavailable;
  const rows = await readEstimatedScoreRows(
    user,
    match.teamSlots.map((t) => t.teamNumber),
    db,
    matchKey,
  );
  return {
    available: true,
    matchKey,
    label: matchKey.split("_").at(-1)!.toUpperCase(),
    tournamentName: match.tournament.name,
    status: match.scoreboardOcr.status,
    redScore: match.alliances.find((a) => a.color === "RED")?.score ?? null,
    blueScore: match.alliances.find((a) => a.color === "BLUE")?.score ?? null,
    timeline,
    teams: match.teamSlots
      .sort(
        (a, b) =>
          a.alliance.localeCompare(b.alliance) ||
          (a.station ?? 0) - (b.station ?? 0),
      )
      .map((t) => {
        const row = rows.find(
          (r) => r.matchKey === matchKey && r.teamNumber === t.teamNumber,
        );
        return {
          teamNumber: t.teamNumber,
          alliance: t.alliance,
          scoutAverage: row?.scoutPoints ?? null,
          ocrAdjustment:
            row?.scoutPoints == null ? null : row.totalPoints - row.scoutPoints,
          totalPoints: row?.totalPoints ?? null,
        };
      }),
  };
}
export const matchEstimates = createAnalysisHandler({
  params: { params: ocrMatchParams },
  usesDataSource: true,
  shouldCache: false,
  calculateAnalysis: ({ params }, ctx) =>
    matchEstimateDetails(ctx.user, params.matchKey),
});

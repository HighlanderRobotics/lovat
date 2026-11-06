import { z } from "zod";
import { MatchType } from "../models/match";
import { ScoutReportMeta } from "../models/ScoutReportMeta";
import { AllianceColor } from "../models/AllianceColor";
import { get } from "./lovatAPI";

export type MatchCheck =
  | { status: "exists"; allianceColor: AllianceColor }
  | { status: "missing" }
  | { status: "offline" };

const responseSchema = z.object({
  match: z.object({
    tournamentKey: z.string(),
    teamNumber: z.number(),
    matchNumber: z.number(),
    matchType: z.enum(["QUALIFICATION", "ELIMINATION", "PRACTICE"]),
  }),
  alliance: z.enum(["red", "blue"]).nullable(),
});

export async function checkMatchExists(
  meta: ScoutReportMeta,
): Promise<MatchCheck> {
  const { tournamentKey, matchNumber, matchType } = meta.matchIdentity;
  const isElim = matchType === MatchType.Elimination;
  const serverMatchType =
    matchType === MatchType.Practice
      ? "PRACTICE"
      : isElim
        ? "ELIMINATION"
        : "QUALIFICATION";
  const controller = new AbortController();
  // Allow Server's 10-second Nexus refresh to finish before treating it as unreachable.
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await get(
      `/v1/manager/checkmatch?tournamentKey=${encodeURIComponent(tournamentKey)}&teamNumber=${meta.teamNumber}&matchNumber=${matchNumber}&isElim=${isElim}&matchType=${serverMatchType}`,
      { signal: controller.signal },
    );
    if (
      response.status === 404 &&
      (await response.text()) === "MATCH_NOT_FOUND"
    ) {
      return { status: "missing" };
    }
    if (!response.ok)
      throw new Error("Unable to verify this match. Please try again.");
    const result = responseSchema.parse(await response.json());
    if (
      result.match.tournamentKey !== tournamentKey ||
      result.match.matchNumber !== matchNumber ||
      result.match.teamNumber !== meta.teamNumber ||
      result.match.matchType !== serverMatchType
    )
      throw new Error("Unexpected match returned. Please try again.");
    return {
      status: "exists",
      allianceColor:
        result.alliance === null
          ? meta.allianceColor
          : result.alliance === "red"
            ? AllianceColor.Red
            : AllianceColor.Blue,
    };
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { status: "offline" };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

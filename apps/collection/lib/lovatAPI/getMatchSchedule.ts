import { z } from "zod";
import { get } from "./lovatAPI";

export const matchScheduleSchema = z.object({
  tournamentKey: z.string(),
  matches: z.array(
    z.object({
      matchNumber: z.number().int(),
      matchType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      teams: z.array(
        z.object({
          number: z.number().int(),
          alliance: z.enum(["red", "blue"]).nullable(),
        }),
      ),
    }),
  ),
});

export type MatchSchedule = z.infer<typeof matchScheduleSchema>;

export async function getMatchSchedule(
  tournamentKey: string,
): Promise<MatchSchedule> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await get(
      `/v1/manager/matchschedule/${encodeURIComponent(tournamentKey)}`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error("Unable to fetch the match schedule.");
    const schedule = matchScheduleSchema.parse(await response.json());
    if (schedule.tournamentKey !== tournamentKey)
      throw new Error("Unexpected tournament in match schedule.");
    return schedule;
  } finally {
    clearTimeout(timeout);
  }
}

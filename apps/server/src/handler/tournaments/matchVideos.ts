import { z } from "zod";
import { publicCache } from "../../lib/publicCache.js";

const videoSchema = z.object({
  videos: z.array(z.object({ type: z.string(), key: z.string() })),
});

export function youtubeVideoIds(input: unknown): string[] {
  const parsed = videoSchema.safeParse(input);

  if (!parsed.success) return [];

  return [
    ...new Set(
      parsed.data.videos
        .filter(
          (video) =>
            video.type === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(video.key),
        )
        .map((video) => video.key),
    ),
  ];
}

export async function matchVideos(key: string): Promise<string[]> {
  if (!process.env.TBA_KEY) return [];

  try {
    return await publicCache(`match-videos:${key}`, async () => {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/match/${key}`,
        {
          headers: {
            "X-TBA-Auth-Key": process.env.TBA_KEY!,
            "User-Agent": "Lovat/26.0",
          },
          signal: AbortSignal.timeout(5_000),
        },
      );

      if (response.status === 404) return [];
      if (!response.ok) throw new Error("Match videos unavailable");

      return youtubeVideoIds(await response.json());
    });
  } catch {
    // Optional recordings must not prevent official results from loading.
    return [];
  }
}

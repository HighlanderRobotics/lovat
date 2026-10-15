import type { Request, Response } from "express";
import { z } from "zod";
import { publicCache } from "../../lib/publicCache.js";

const mediaSchema = z.array(
  z.object({
    type: z.string(),
    preferred: z.boolean().optional(),
    direct_url: z.string().optional(),
    details: z
      .object({
        image_url_med: z.string().optional(),
        image_url: z.string().optional(),
      })
      .nullish(),
  }),
);

export function chooseRobotPhoto(input: unknown): string | null {
  const media = mediaSchema
    .parse(input)
    .filter((item) => ["imgur", "smugmug-photo"].includes(item.type));

  media.sort(
    (a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)),
  );

  for (const item of media) {
    const value =
      item.details?.image_url_med || item.direct_url || item.details?.image_url;

    if (!value) continue;

    try {
      const url = new URL(value);
      const allowed =
        url.hostname === "i.imgur.com" ||
        url.hostname === "photos.smugmug.com" ||
        url.hostname.endsWith(".smugmug.com");

      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        allowed &&
        /\.(?:jpe?g|png|webp)$/i.test(url.pathname)
      )
        return url.href;
    } catch {
      // Skip unsupported or malformed provider links.
    }
  }

  return null;
}

export async function getRobotPhoto(
  req: Request,
  res: Response,
): Promise<void> {
  const number = Number(req.params.number);
  const year = Number(req.params.year);

  if (
    !Number.isInteger(number) ||
    number <= 0 ||
    number > 2_147_483_647 ||
    !Number.isInteger(year) ||
    year < 1992 ||
    year > 9999
  ) {
    res.status(400).json({ error: "Invalid team or year" });
    return;
  }

  try {
    const photo = await publicCache(
      `robot-photo:${number}:${year}`,
      async () => {
        if (!process.env.TBA_KEY) return null;

        const response = await fetch(
          `https://www.thebluealliance.com/api/v3/team/frc${number}/media/${year}`,
          {
            headers: {
              "X-TBA-Auth-Key": process.env.TBA_KEY,
              "User-Agent": "Lovat/26.0",
            },
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Robot media unavailable");

        const image = chooseRobotPhoto(await response.json());

        return image
          ? {
              image,
              source: `https://www.thebluealliance.com/team/${number}/${year}`,
            }
          : null;
      },
      86400,
    );

    res.set("Cache-Control", "public, max-age=3600");
    res.json({ photo });
  } catch {
    res.status(503).json({ error: "Robot photo unavailable" });
  }
}

import type { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";

export async function getTeamAvatar(
  req: Request,
  res: Response,
): Promise<void> {
  const teamNumber = Number(req.params.number);
  const seasonYear = Number(req.params.year);

  if (
    !Number.isSafeInteger(teamNumber) ||
    teamNumber <= 0 ||
    teamNumber > 2_147_483_647 ||
    !Number.isSafeInteger(seasonYear) ||
    seasonYear < 1992 ||
    seasonYear > 9999
  ) {
    res.status(400).end();
    return;
  }

  try {
    const team = await prismaClient.teamSeason.findUnique({
      where: { teamNumber_seasonYear: { teamNumber, seasonYear } },
      select: { avatar: true },
    });
    const image = team?.avatar?.match(
      /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/,
    );

    if (!image) {
      res.status(404).end();
      return;
    }

    res.set("Cache-Control", "public, max-age=86400");
    res.set("Content-Type", image[1]!);
    res.set("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(image[2]!, "base64"));
  } catch {
    res.status(503).end();
  }
}

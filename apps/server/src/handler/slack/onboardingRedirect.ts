import prismaClient from "../../prismaClient.js";
import { Request, Response } from "express";
import z from "zod";
import { randomBytes } from "node:crypto";
import { kv } from "../../redisClient.js";

export const onboardingRedirect = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const params = z.object({ team_code: z.string() }).parse(req.query);

    const teamRow = await prismaClient.registeredTeam.findUnique({
      where: {
        code: params.team_code,
      },
    });

    if (!teamRow) {
      res.status(404).send("Team code not associated with a team");
      return;
    }

    const state = randomBytes(24).toString("base64url");
    await kv.setEx(`slack:oauth:${state}`, params.team_code, 10 * 60);

    if (process.env.NODE_ENV === "development") {
      res.redirect(
        "https://slack.com/oauth/v2/authorize?client_id=645725051604.9558878384433&scope=channels:join,channels:read,chat:write,chat:write.public,commands&user_scope=&state=" +
          encodeURIComponent(state),
      );
    } else {
      res.redirect(
        "https://slack.com/oauth/v2/authorize?client_id=645725051604.9455262680016&scope=channels:join,channels:read,chat:write,commands,chat:write.public&user_scope=&state=" +
          encodeURIComponent(state),
      );
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};

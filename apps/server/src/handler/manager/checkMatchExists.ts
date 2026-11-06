import z from "zod";
import { addTournamentMatches } from "./addTournamentMatches.js";
import { Request, Response } from "express";
import prismaClient from "../../prismaClient.js";
import { MatchType } from "@lovat/db";

export const checkMatchExists = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const parsed = z
      .object({
        tournamentKey: z.string(),
        teamNumber: z.coerce.number().int(),
        matchNumber: z.coerce.number().int(),
        isElim: z
          .union([z.literal("true"), z.literal("false"), z.boolean()])
          .transform((value) => value === true || value === "true")
          .optional(),
        matchType: z.nativeEnum(MatchType).optional(),
      })
      .refine(
        (value) => value.matchType !== undefined || value.isElim !== undefined,
      )
      .safeParse(req.query);

    if (!parsed.success) {
      res.status(400).send(parsed.error.flatten());
      return;
    }

    const params = parsed.data;
    const matchType =
      params.matchType ??
      (params.isElim ? MatchType.ELIMINATION : MatchType.QUALIFICATION);

    await addTournamentMatches(params.tournamentKey);

    const match = await prismaClient.teamMatchData.findFirst({
      where: {
        matchNumber: params.matchNumber,
        tournamentKey: params.tournamentKey,
        teamNumber: params.teamNumber,
        matchType,
        ...(matchType === MatchType.PRACTICE
          ? { practiceScheduled: true }
          : {}),
      },
    });

    if (match !== null) {
      res.status(200).send({
        match,
        // Practice keys end in team numbers, not alliance positions.
        alliance:
          matchType === MatchType.PRACTICE
            ? null
            : Number(match.key.at(-1)) < 3
              ? "red"
              : "blue",
      });
      return;
    }
    res.status(404).send("MATCH_NOT_FOUND");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};

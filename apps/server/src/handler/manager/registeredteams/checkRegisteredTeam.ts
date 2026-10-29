import prismaClient from "../../../prismaClient.js";
import z from "zod";
import { Response } from "express";
import { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";

export const checkRegisteredTeam = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const params = z
      .object({
        number: z.number().min(0),
      })
      .safeParse({
        number: Number(req.params.team),
      });

    if (!params.success) {
      res.status(400).send(params);
      return;
    }

    const row = await prismaClient.registeredTeam.findUnique({
      where: {
        number: params.data.number,
      },
      include: {
        users: true,
      },
    });
    const featureToggle = await prismaClient.featureToggle.findUnique({
      where: {
        feature: "fullRegistration",
      },
    });
    // A missing seed row must not crash login or reopen an approved team's
    // registration. Unapproved teams retain the full verification flow.
    const fullRegistration = featureToggle?.enabled ?? !row?.teamApproved;
    if (row === null) {
      res.status(200).send({ status: "NOT_STARTED" });
    } else if (row.users[0]?.id === req.user.id) {
      if (row.emailVerified) {
        if ((fullRegistration && row.website) || fullRegistration === false) {
          if (row.teamApproved) {
            if (req.user.teamNumber === row.number) {
              res.status(200).send({ status: "REGISTERED_ON_TEAM" });
            } else {
              res.status(200).send({ status: "REGISTERED_OFF_TEAM" });
            }
          } else {
            res.status(200).send({
              status: "PENDING_TEAM_VERIFICATION",
              teamEmail: row.email,
            });
          }
        } else {
          res.status(200).send({ status: "PENDING_WEBSITE" });
        }
      } else {
        res
          .status(200)
          .send({ status: "PENDING_EMAIL_VERIFICATION", email: row.email });
      }
    } else {
      if (row.emailVerified && row.teamApproved) {
        if (req.user.teamNumber === row.number) {
          res.status(200).send({ status: "REGISTERED_ON_TEAM" });
        } else {
          res.status(200).send({ status: "REGISTERED_OFF_TEAM" });
        }
      } else {
        res.status(200).send({ status: "PENDING" });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};

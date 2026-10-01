import { Request as ExpressRequest, Response, NextFunction } from "express";

export const requireSlackToken = async (
  req: ExpressRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const signature = req.headers["x-slack-signature"];
    const timestamp = req.headers["x-slack-request-timestamp"];
    const verificationKey = req.body?.token;

    if (typeof signature !== "string" || typeof timestamp !== "string") {
      res.status(401).send("Unauthorized");
      console.warn("Missing Slack signature or timestamp");
      return;
    }

    if (
      !/^\d+$/.test(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 60 * 5
    ) {
      res.status(401).send("Stale request");
      console.warn("Received stale Slack request with timestamp:", timestamp);
      return;
    }

    if (
      typeof verificationKey !== "string" ||
      !process.env.SLACK_VERIFICATION_KEY ||
      process.env.SLACK_VERIFICATION_KEY !== verificationKey
    ) {
      res.status(401).send("Unauthorized");
      console.warn("Invalid Slack verification token");
      return;
    }

    if (req.body?.challenge !== undefined) {
      if (typeof req.body.challenge !== "string") {
        res.status(400).send("Invalid challenge");
        return;
      }
      res.status(200).json({ challenge: req.body.challenge });
      return;
    }

    next();
  } catch (error) {
    res.status(500).send("Internal server error verifying request");
    return;
  }
};

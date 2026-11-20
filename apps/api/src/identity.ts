import { createHash } from "node:crypto";
import { createJwtVerifier } from "./auth.js";
import type { PrismaClient } from "@lovat/db";
import { HttpError } from "./errors.js";
import type { Session } from "./http/router.js";

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
export function createIdentityService(
  db: PrismaClient,
  options: {
    issuer: string;
    audience: string;
    limiter: RateLimiter;
    verify?: (token: string) => Promise<{ sub?: string }>;
    provision?: (token: string, subject: string) => Promise<void>;
  },
) {
  const verify = options.verify ?? createJwtVerifier(options);
  const select = {
    id: true,
    teamNumber: true,
    role: true,
    email: true,
    emailVerified: true,
    username: true,
    teamSourceRule: true,
    tournamentSourceRule: true,
    team: { select: { emailVerified: true } },
  } as const;
  return async (authorization: string | undefined): Promise<Session> => {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
    if (!match)
      throw new HttpError(401, "UNAUTHORIZED", "A bearer token is required");
    const token = match[1];
    if (token.startsWith("lvt-")) {
      const hash = createHash("sha256").update(token).digest("hex");
      const key = await db.apiKey.findUnique({
        where: { keyHash: hash },
        select: { user: { select } },
      });
      if (!key) throw new HttpError(401, "UNAUTHORIZED", "Invalid API key");
      if (!(await options.limiter.consume("apikey:" + hash, 1, 3)))
        throw new HttpError(
          429,
          "RATE_LIMITED",
          "Wait three seconds before another API-key request",
        );
      return { user: key.user, tokenType: "apiKey" };
    }
    let subject: string | undefined;
    try {
      subject = (await verify(token)).sub;
    } catch {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid authorization token");
    }
    if (!subject)
      throw new HttpError(401, "UNAUTHORIZED", "Token has no subject");
    let user = await db.user.findUnique({ where: { id: subject }, select });
    if (!user && options.provision) {
      await options.provision(token, subject);
      user = await db.user.findUnique({ where: { id: subject }, select });
    }
    if (!user)
      throw new HttpError(
        401,
        "IDENTITY_NOT_PROVISIONED",
        "Complete account onboarding",
      );
    if (
      !(await options.limiter.consume(
        "user:" + createHash("sha256").update(user.id).digest("hex"),
        600,
        60,
      ))
    ) {
      throw new HttpError(429, "RATE_LIMITED", "Too many requests");
    }
    return { user, tokenType: "jwt" };
  };
}

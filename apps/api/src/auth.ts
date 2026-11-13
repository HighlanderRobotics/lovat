import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { HttpError } from "./errors.js";

const teamRule = z.object({
  mode: z.enum(["INCLUDE", "EXCLUDE"]),
  items: z.array(z.number().int().positive()),
});
const tournamentRule = z.object({
  mode: z.enum(["INCLUDE", "EXCLUDE"]),
  items: z.array(z.string().min(1)),
});
export interface StoredIdentity {
  id: string;
  teamNumber: number | null;
  role: string;
  teamSourceRule: unknown;
  tournamentSourceRule: unknown;
  team: { emailVerified: boolean } | null;
}
export interface AccessScope {
  userId: string;
  teamNumber: number;
  role: string;
  sources: {
    teams: z.infer<typeof teamRule>;
    tournaments: z.infer<typeof tournamentRule>;
  };
}
export interface AuthRepository {
  userById(id: string): Promise<StoredIdentity | null>;
}
export type Authenticate = (
  authorization: string | undefined,
) => Promise<AccessScope>;

/** A new factory per application; no keys, environment or connections at module import. */
export function createAuthenticator(
  repository: AuthRepository,
  options: {
    issuer: string;
    audience: string;
    verify?: (token: string) => Promise<{ sub?: string }>;
  },
): Authenticate {
  const issuer = new URL(options.issuer);
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash
  ) {
    throw new Error("AUTH0_ISSUER must be an HTTPS issuer URL");
  }
  const jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", issuer), {
    timeoutDuration: 3000,
  });
  const verify =
    options.verify ??
    (async (token: string) =>
      (
        await jwtVerify(token, jwks, {
          issuer: options.issuer,
          audience: options.audience,
        })
      ).payload);

  return async (authorization) => {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
    if (!match) {
      throw new HttpError(401, "UNAUTHORIZED", "A bearer token is required");
    }
    // API keys remain on v1 until shared revocation and distributed rate limits migrate.
    if (match[1].startsWith("lvt-")) {
      throw new HttpError(
        401,
        "JWT_REQUIRED",
        "This API version requires a Dashboard token",
      );
    }
    let subject: string | undefined;
    try {
      subject = (await verify(match[1])).sub;
    } catch {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid authorization token");
    }
    if (!subject) {
      throw new HttpError(401, "UNAUTHORIZED", "Token has no subject");
    }

    const user = await repository.userById(subject);
    if (!user) {
      throw new HttpError(
        401,
        "IDENTITY_NOT_PROVISIONED",
        "Sign in through the existing onboarding flow first",
      );
    }
    if (!user.teamNumber || !user.team?.emailVerified) {
      throw new HttpError(
        403,
        "TEAM_NOT_VERIFIED",
        "A verified team is required",
      );
    }
    // Stored scope is authoritative. Corrupt state must never widen visibility.
    const teams = teamRule.safeParse(user.teamSourceRule);
    const tournaments = tournamentRule.safeParse(user.tournamentSourceRule);
    if (!teams.success || !tournaments.success) {
      throw new HttpError(
        503,
        "INVALID_ACCESS_SCOPE",
        "Access settings are unavailable",
      );
    }
    return {
      userId: user.id,
      teamNumber: user.teamNumber,
      role: user.role,
      sources: {
        teams: teams.data,
        tournaments: tournaments.data,
      },
    };
  };
}

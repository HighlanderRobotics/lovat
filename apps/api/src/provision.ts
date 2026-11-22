import { z } from "zod";
import type { PrismaClient } from "@lovat/db";
import { HttpError } from "./errors.js";
/** Profile hydration happens only for a new subject, never on the normal request path. */
export function createProvisioner(
  db: PrismaClient,
  issuer: string,
  fetcher: typeof fetch = fetch,
) {
  const endpoint = new URL(
    "userinfo",
    issuer.endsWith("/") ? issuer : issuer + "/",
  );
  if (endpoint.protocol !== "https:")
    throw new Error("Identity issuer must use HTTPS");
  return async (token: string, subject: string) => {
    const response = await fetcher(endpoint, {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new HttpError(
        503,
        "IDENTITY_UNAVAILABLE",
        "Account onboarding is temporarily unavailable",
      );
    const profile = z
      .object({
        sub: z.literal(subject),
        email: z.email(),
        email_verified: z.boolean().default(false),
      })
      .safeParse(await response.json());
    if (!profile.success)
      throw new HttpError(
        401,
        "INVALID_IDENTITY",
        "Identity profile does not match the token",
      );
    await db.user.upsert({
      where: { id: subject },
      create: {
        id: subject,
        email: profile.data.email,
        emailVerified: profile.data.email_verified,
      },
      update: {},
    });
  };
}

import { createHash } from "node:crypto";
import type { RateLimiter } from "../identity.js";
import type { PrismaClient } from "@lovat/db";
import type { IncomingHttpHeaders } from "node:http";
import { HttpError } from "../errors.js";
import { type ServiceRouter, type Context, type Session } from "./router.js";

export interface ServiceDependencies {
  router: ServiceRouter;
  limiter?: RateLimiter;
  db: PrismaClient;
  authenticate: (authorization: string | undefined) => Promise<Session>;
  verifySignature?: (
    headers: IncomingHttpHeaders,
    raw: string,
    slack: boolean,
    method: string,
    path: string,
    body: unknown,
  ) => Promise<boolean>;
}
export async function dispatch(
  deps: ServiceDependencies,
  match: NonNullable<ReturnType<ServiceRouter["match"]>>,
  request: {
    headers: IncomingHttpHeaders;
    query: Record<string, string>;
    body: unknown;
    rawBody: string;
    method: string;
    path: string;
    remoteAddress?: string;
  },
): Promise<unknown> {
  const { endpoint } = match;
  let session: Session | null = null;
  const peer = createHash("sha256")
    .update(request.remoteAddress ?? "unknown")
    .digest("hex");
  const limitedPublic =
    endpoint.policy === "public" &&
    (endpoint.path.endsWith("/checkcode") ||
      endpoint.path.endsWith("/emailTeamCode") ||
      (endpoint.method === "POST" &&
        endpoint.path.endsWith("/training/sessions")));
  if (
    limitedPublic &&
    deps.limiter &&
    !(await deps.limiter.consume(
      "public:" + endpoint.path + ":" + peer,
      20,
      60,
    ))
  )
    throw new HttpError(
      429,
      "RATE_LIMITED",
      "Too many requests; retry shortly",
    );
  if (["session", "jwt", "verified", "lead"].includes(endpoint.policy)) {
    session = await deps.authenticate(request.headers.authorization);
    if (endpoint.policy === "jwt" && session.tokenType !== "jwt")
      throw new HttpError(
        403,
        "JWT_REQUIRED",
        "A Dashboard session is required",
      );
    if (
      ["verified", "lead"].includes(endpoint.policy) &&
      (!session.user.teamNumber || !session.user.team?.emailVerified)
    ) {
      throw new HttpError(
        403,
        "TEAM_NOT_VERIFIED",
        "A verified team is required",
      );
    }
    if (
      endpoint.policy === "lead" &&
      (session.tokenType !== "jwt" || session.user.role !== "SCOUTING_LEAD")
    ) {
      throw new HttpError(
        403,
        "SCOUTING_LEAD_REQUIRED",
        "A scouting lead is required",
      );
    }
  }
  if (endpoint.policy === "signed" || endpoint.policy === "slack") {
    if (
      !deps.verifySignature ||
      !(await deps.verifySignature(
        request.headers,
        request.rawBody,
        endpoint.policy === "slack",
        request.method,
        request.path,
        request.body,
      ))
    ) {
      throw new HttpError(
        403,
        "INVALID_SIGNATURE",
        "Invalid request signature",
      );
    }
  }
  const ctx: Context = {
    ...request,
    db: deps.db,
    params: match.params,
    session,
  };
  if (endpoint.policy === "collection") {
    const code = request.headers["x-team-code"];
    if (typeof code !== "string" || !code)
      throw new HttpError(401, "TEAM_CODE_REQUIRED", "A team code is required");
    const team = await deps.db.registeredTeam.findUnique({
      where: { code },
      select: { number: true },
    });
    if (!team)
      throw new HttpError(401, "INVALID_TEAM_CODE", "Team code is not correct");
    if (
      deps.limiter &&
      !(await deps.limiter.consume(
        "collection:" + team.number + ":" + peer,
        300,
        60,
      ))
    )
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Too many Collection requests; retry shortly",
      );
    ctx.collectionTeam = team.number;
  }
  return endpoint.handle(ctx);
}

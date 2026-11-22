import type { IncomingHttpHeaders } from "node:http";
import type { PrismaClient } from "@lovat/db";
import { z } from "zod";
import { HttpError } from "../errors.js";
import type { StoredIdentity } from "../auth.js";

export interface Session {
  user: StoredIdentity;
  tokenType: "jwt" | "apiKey";
}
export interface Context {
  db: PrismaClient;
  session: Session | null;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
  body: unknown;
  rawBody: string;
  collectionTeam?: number;
}
export type Policy =
  | "public"
  | "session"
  | "jwt"
  | "verified"
  | "lead"
  | "collection"
  | "signed"
  | "slack";
export interface Endpoint {
  module?: string;
  method: string;
  path: string;
  policy: Policy;
  handle: (ctx: Context) => Promise<unknown>;
}
export class Reply {
  constructor(
    readonly body: unknown,
    readonly status = 200,
    readonly headers: Record<string, string> = {},
  ) {}
}
export class ServiceRouter {
  readonly endpoints: Endpoint[] = [];
  add(
    method: string,
    path: string,
    policy: Policy,
    handle: Endpoint["handle"],
  ) {
    if (this.endpoints.some((e) => e.method === method && e.path === path))
      throw new Error("Duplicate endpoint: " + method + " " + path);
    const endpoint = { method, path, policy, handle };
    this.endpoints.push(endpoint);
  }
}

export function input<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_REQUEST", "Invalid request parameters");
  return parsed.data;
}
export function user(ctx: Context): StoredIdentity {
  if (!ctx.session) throw new HttpError(401, "UNAUTHORIZED", "Sign in first");
  return ctx.session.user;
}
export function team(ctx: Context): number {
  const number = user(ctx).teamNumber;
  if (!number) throw new HttpError(403, "TEAM_REQUIRED", "A team is required");
  return number;
}
export function writable(ctx: Context) {
  if (ctx.session?.tokenType !== "jwt")
    throw new HttpError(
      403,
      "JWT_REQUIRED",
      "This action requires a Dashboard session",
    );
}
export const identifier = z.string().min(1).max(256);
export const positive = z.coerce.number().int().positive();
export const pageSchema = z.object({
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).max(100000).default(0),
  filter: z.string().max(200).optional(),
});
export function notFound(message = "Resource not found"): never {
  throw new HttpError(404, "NOT_FOUND", message);
}

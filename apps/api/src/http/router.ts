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
  private readonly candidates = new Map<
    string,
    { endpoint: Endpoint; template: string[] }[]
  >();
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
    const template = path.replace(/\/$/, "").split("/");
    const key = method + ":" + template.length;
    if (!this.candidates.has(key)) this.candidates.set(key, []);
    this.candidates.get(key)!.push({ endpoint, template });
  }
  match(
    method: string,
    path: string,
  ): { endpoint: Endpoint; params: Record<string, string> } | null {
    const parts = path.replace(/\/$/, "").split("/");
    for (const { endpoint, template } of this.candidates.get(
      method + ":" + parts.length,
    ) ?? []) {
      const params: Record<string, string> = {};
      let valid = true;
      for (let i = 0; i < template.length; i++) {
        if (template[i].startsWith(":")) {
          try {
            params[template[i].slice(1)] = decodeURIComponent(parts[i]);
          } catch {
            throw new HttpError(400, "INVALID_PATH", "Invalid URL encoding");
          }
        } else if (template[i] !== parts[i]) {
          valid = false;
          break;
        }
      }
      if (valid) return { endpoint, params };
    }
    return null;
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

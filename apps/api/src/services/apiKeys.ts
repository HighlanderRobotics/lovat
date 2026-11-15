import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ServiceRouter,
  input,
  user,
  writable,
  notFound,
} from "../http/router.js";
import { HttpError } from "../errors.js";

export function registerApiKeys(router: ServiceRouter) {
  const path = "/v1/manager/apikey";
  router.add("GET", path, "verified", async (ctx) =>
    ctx.db.apiKey.findMany({
      where: { userId: user(ctx).id },
      select: {
        uuid: true,
        name: true,
        createdAt: true,
        lastUsed: true,
        requests: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  );
  router.add("POST", path, "verified", async (ctx) => {
    writable(ctx);
    const { name } = input(
      z.object({ name: z.string().trim().min(1).max(200) }),
      ctx.query,
    );
    const apiKey = "lvt-" + randomBytes(32).toString("hex");
    await ctx.db.apiKey.create({
      data: {
        name,
        userId: user(ctx).id,
        keyHash: createHash("sha256").update(apiKey).digest("hex"),
      },
    });
    return { apiKey };
  });
  router.add("PATCH", path, "verified", async (ctx) => {
    writable(ctx);
    const data = input(
      z.object({
        uuid: z.string().min(1),
        name: z.string().trim().min(1).max(200),
      }),
      ctx.query,
    );
    await ctx.db.apiKey.update({
      where: { uuid: data.uuid, userId: user(ctx).id },
      data: { name: data.name },
    });
    return "Key successfully renamed";
  });
  router.add("DELETE", path, "verified", async (ctx) => {
    writable(ctx);
    const { uuid } = input(z.object({ uuid: z.string().min(1) }), ctx.query);
    const key = await ctx.db.apiKey.findUnique({
      where: { uuid },
      select: { userId: true, user: { select: { teamNumber: true } } },
    });
    if (!key) notFound("API key not found");
    if (
      key.userId !== user(ctx).id &&
      !(
        user(ctx).role === "SCOUTING_LEAD" &&
        key.user.teamNumber === user(ctx).teamNumber
      )
    ) {
      throw new HttpError(403, "FORBIDDEN", "You cannot revoke this API key");
    }
    await ctx.db.apiKey.delete({ where: { uuid } });
    return "Key successfully revoked";
  });
}

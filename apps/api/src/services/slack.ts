import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ServiceRouter, Reply, input, notFound } from "../http/router.js";
import { HttpError } from "../errors.js";
export interface OAuthState {
  put(key: string, value: string, ttl: number): Promise<void>;
  take(key: string): Promise<string | null>;
}
export interface SlackOptions {
  clientId?: string;
  clientSecret?: string;
  baseUrl: string;
  state?: OAuthState;
  fetcher?: typeof fetch;
}
export function registerSlack(router: ServiceRouter, options: SlackOptions) {
  const redirect = (location: string) =>
    new Reply("", 302, { Location: location });
  router.add("GET", "/v1/slack-invite", "public", async (ctx) => {
    if (!options.clientId || !options.state)
      throw new HttpError(
        503,
        "SLACK_UNAVAILABLE",
        "Slack integration is not configured",
      );
    const code = input(z.string().min(1).max(128), ctx.query.team_code);
    const team = await ctx.db.registeredTeam.findUnique({
      where: { code },
      select: { number: true },
    });
    if (!team) notFound("Team code not associated with a team");
    const state = randomBytes(24).toString("base64url");
    await options.state.put(state, String(team.number), 600);
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.search = new URLSearchParams({
      client_id: options.clientId,
      scope:
        "channels:join,channels:read,chat:write,chat:write.public,commands",
      state,
      redirect_uri: new URL("/v1/slack/add-workspace", options.baseUrl).href,
    }).toString();
    return redirect(url.href);
  });
  router.add("GET", "/v1/slack/add-workspace", "public", async (ctx) => {
    if (!options.clientId || !options.clientSecret || !options.state)
      throw new HttpError(
        503,
        "SLACK_UNAVAILABLE",
        "Slack integration is not configured",
      );
    const data = input(
      z.object({
        code: z.string().min(1).max(1000),
        state: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
      }),
      ctx.query,
    );
    const owner = await options.state.take(data.state);
    if (!owner)
      throw new HttpError(
        400,
        "INVALID_OAUTH_STATE",
        "Invalid or expired OAuth state",
      );
    const response = await (options.fetcher ?? fetch)(
      "https://slack.com/api/oauth.v2.access",
      {
        method: "POST",
        body: new URLSearchParams({
          code: data.code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: new URL("/v1/slack/add-workspace", options.baseUrl)
            .href,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new HttpError(
        502,
        "SLACK_UNAVAILABLE",
        "Slack authorization failed",
      );
    const parsed = z
      .object({
        ok: z.literal(true),
        access_token: z.string(),
        team: z.object({ id: z.string(), name: z.string() }),
        bot_user_id: z.string(),
        authed_user: z.object({ id: z.string() }),
      })
      .safeParse(await response.json());
    if (!parsed.success)
      throw new HttpError(
        502,
        "SLACK_UNAVAILABLE",
        "Slack authorization failed",
      );
    const dataRow = parsed.data;
    // A workspace cannot silently move to another team on an OAuth retry.
    await ctx.db.$transaction(async (tx) => {
      const existing = await tx.slackWorkspace.findUnique({
        where: { workspaceId: dataRow.team.id },
      });
      if (existing && existing.owner !== Number(owner))
        throw new HttpError(
          409,
          "WORKSPACE_ALREADY_LINKED",
          "Slack workspace belongs to another team",
        );
      const values = {
        owner: Number(owner),
        name: dataRow.team.name,
        authToken: dataRow.access_token,
        botUserId: dataRow.bot_user_id,
        authUserId: dataRow.authed_user.id,
      };
      await tx.slackWorkspace.upsert({
        where: { workspaceId: dataRow.team.id, owner: Number(owner) },
        create: { workspaceId: dataRow.team.id, ...values },
        update: values,
      });
    });
    return redirect(
      "https://lovat-learn.highlanderrobotics.com/guides/slack-notifcations",
    );
  });
  router.add("POST", "/v1/slack/command", "slack", async (ctx) => {
    const data = input(
      z.object({
        text: z.string().max(1000),
        team_id: z.string(),
        channel_id: z.string(),
        command: z.literal("/lovat"),
      }),
      ctx.body,
    );
    const [action, kind] = data.text.trim().split(/\s+/);
    if (!action || action === "help")
      return "Use /lovat subscribe break or /lovat unsubscribe break to manage robot break notifications.";
    if (
      !["subscribe", "unsubscribe"].includes(action) ||
      (kind && kind !== "break")
    )
      return "Unknown command. Use /lovat help.";
    const workspace = await ctx.db.slackWorkspace.findUnique({
      where: { workspaceId: data.team_id },
      select: { owner: true },
    });
    if (!workspace)
      return "Connect your Slack workspace to a Lovat team first.";
    if (action === "subscribe")
      await ctx.db.slackSubscription.upsert({
        where: { subscriptionId: data.channel_id + "_B" },
        create: {
          subscriptionId: data.channel_id + "_B",
          channelId: data.channel_id,
          workspaceId: data.team_id,
          subscribedEvent: "BREAK",
        },
        update: {
          channelId: data.channel_id,
          workspaceId: data.team_id,
          subscribedEvent: "BREAK",
        },
      });
    else
      await ctx.db.slackSubscription.deleteMany({
        where: {
          workspaceId: data.team_id,
          channelId: data.channel_id,
          subscribedEvent: "BREAK",
        },
      });
    return action === "subscribe"
      ? "Successfully subscribed to 'break' notifications"
      : "Successfully unsubscribed from 'break' notifications";
  });
  router.add("POST", "/v1/slack/event", "slack", async (ctx) => {
    const challenge = z
      .object({
        type: z.literal("url_verification"),
        challenge: z.string().max(1000),
      })
      .safeParse(ctx.body);
    if (challenge.success) return { challenge: challenge.data.challenge };
    const data = input(
      z.object({
        type: z.literal("event_callback"),
        team_id: z.string(),
        event_id: z.string(),
        event: z.object({ type: z.string(), channel: z.string().optional() }),
      }),
      ctx.body,
    );
    if (data.event.type === "app_uninstalled")
      await ctx.db.slackWorkspace.deleteMany({
        where: { workspaceId: data.team_id },
      });
    else if (data.event.type === "channel_deleted" && data.event.channel)
      await ctx.db.slackSubscription.deleteMany({
        where: { workspaceId: data.team_id, channelId: data.event.channel },
      });
    return "Event processed";
  });
}

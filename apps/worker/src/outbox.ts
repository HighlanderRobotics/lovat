import { randomUUID } from "node:crypto";
import { RedisClient } from "bun";
import type { ApiOutbox, PrismaClient } from "@lovat/db";
import { effectSchema, type Effect } from "@lovat/api/effects";

const publishRevisionScript =
  "local old=redis.call('GET',KEYS[1]); local v=ARGV[1]; if not old or #v>#old or (#v==#old and v>old) then redis.call('SET',KEYS[1],v) end; return 1";
export interface OutboxDelivery {
  deliver(effect: Effect, id: string): Promise<void>;
}
export function createOutboxDelivery(
  db: PrismaClient,
  options: {
    redisUrl: string;
    prefix: string;
    resendKey?: string;
    emailFrom?: string;
    slackWebhook?: string;
    fetcher?: typeof fetch;
  },
): OutboxDelivery & { close(): void } {
  if (!options.prefix || /[*?\[\]\\]/.test(options.prefix))
    throw new Error("Invalid Redis prefix");
  const redis = new RedisClient(options.redisUrl, {
    connectionTimeout: 2000,
    enableOfflineQueue: false,
    maxRetries: 1,
  });
  let connecting: Promise<void> | undefined;
  const connect = async () => {
    if (!redis.connected) {
      connecting ??= redis.connect().finally(() => {
        connecting = undefined;
      });
      await connecting;
    }
  };
  const fetcher = options.fetcher ?? fetch;
  const slack = async (token: string, body: Record<string, unknown>) => {
    const response = await fetcher("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data: unknown = await response.json();
    if (
      !response.ok ||
      !data ||
      typeof data !== "object" ||
      !("ok" in data) ||
      data.ok !== true
    )
      throw new Error("Slack delivery failed");
    return data as { ok: true; ts?: string };
  };
  const escape = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return {
    close: () => redis.close(),
    async deliver(effect, id) {
      if (effect.kind === "cache.revision") {
        await connect();
        await redis.send("EVAL", [
          publishRevisionScript,
          "1",
          options.prefix + "revision:" + effect.teamNumber,
          effect.revision,
        ]);
      } else if (effect.kind === "email.send") {
        if (!options.resendKey || !options.emailFrom)
          throw new Error("Email delivery is not configured");
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + options.resendKey,
            "Content-Type": "application/json",
            "Idempotency-Key": id,
          },
          body: JSON.stringify({
            from: options.emailFrom,
            to: [effect.to],
            subject: effect.subject,
            text: effect.text,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Email delivery failed");
      } else if (effect.kind === "slack.registration") {
        if (!options.slackWebhook)
          throw new Error("Registration notification is not configured");
        const row = await db.registeredTeam.findUnique({
          where: { number: effect.teamNumber },
        });
        if (!row || row.teamApproved) return;
        const response = await fetcher(options.slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "Received a new team wanting to register",
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*Number*\n" +
                    row.number +
                    "\n*Website*\n" +
                    escape(row.website ?? "None") +
                    "\n*Team Email*\n" +
                    escape(row.email),
                },
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Approve" },
                    value: "approve_" + row.number,
                    action_id: "verify_action",
                  },
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Reject" },
                    value: "reject_" + row.number,
                    action_id: "reject_action",
                  },
                ],
              },
            ],
          }),
        });
        if (!response.ok) throw new Error("Registration notification failed");
      } else if (effect.kind === "slack.message") {
        const workspace = await db.slackWorkspace.findUnique({
          where: { workspaceId: effect.workspaceId },
          select: { authToken: true },
        });
        if (!workspace) return;
        await slack(workspace.authToken, {
          channel: effect.channelId,
          text: effect.text,
          client_msg_id: id,
        });
      } else {
        const report = await db.scoutReport.findFirst({
          where: {
            uuid: effect.reportUuid,
            training: false,
            scouter: { sourceTeamNumber: effect.sourceTeamNumber },
          },
          include: { scouter: true, teamMatchData: true },
        });
        if (!report?.robotBrokeDescription?.trim()) return;
        const slot = report.teamMatchData;
        const upcoming = await db.teamMatchData.findMany({
          where: {
            tournamentKey: slot.tournamentKey,
            teamNumber: slot.teamNumber,
            matchType: "QUALIFICATION",
            matchNumber: { gt: slot.matchNumber },
          },
          select: { matchNumber: true, alliance: true, key: true },
          take: 1000,
        });
        if (!upcoming.length) return;
        const partners = await db.teamMatchData.findMany({
          where: {
            tournamentKey: slot.tournamentKey,
            matchType: "QUALIFICATION",
            teamNumber: { not: slot.teamNumber },
            matchNumber: { in: upcoming.map((row) => row.matchNumber) },
          },
          select: {
            teamNumber: true,
            matchNumber: true,
            alliance: true,
            key: true,
          },
          take: 6000,
        });
        const byMatch = new Map(
          upcoming.map((row) => [
            row.matchNumber,
            row.alliance ?? (Number(row.key.at(-1)) < 3 ? "RED" : "BLUE"),
          ]),
        );
        const partnerTeams = [
          ...new Set(
            partners
              .filter(
                (row) =>
                  (row.alliance ??
                    (Number(row.key.at(-1)) < 3 ? "RED" : "BLUE")) ===
                  byMatch.get(row.matchNumber),
              )
              .map((row) => row.teamNumber),
          ),
        ];
        const channels = await db.slackSubscription.findMany({
          where: {
            ...(effect.kind === "slack.warning.channel"
              ? { subscriptionId: effect.subscriptionId }
              : {}),
            subscribedEvent: "BREAK",
            workspace: { owner: { in: partnerTeams } },
          },
          include: { workspace: true },
          take: 1000,
        });
        if (effect.kind === "slack.warning") {
          await db.apiOutbox.createMany({
            skipDuplicates: true,
            data: channels.map((channel) => {
              const payload = effectSchema.parse({
                ...effect,
                kind: "slack.warning.channel",
                subscriptionId: channel.subscriptionId,
              });
              return {
                id: randomUUID(),
                dedupeKey:
                  "break-channel:" +
                  effect.reportUuid +
                  ":" +
                  channel.subscriptionId,
                kind: payload.kind,
                payload,
              };
            }),
          });
          return;
        }
        for (const channel of channels) {
          const author =
            report.scouter.sourceTeamNumber === channel.workspace.owner
              ? report.scouter.name?.trim() ||
                "A scouter from team " + report.scouter.sourceTeamNumber
              : "A scouter from team " + report.scouter.sourceTeamNumber;
          const thread = await db.slackNotificationThread.findFirst({
            where: {
              teamNumber: slot.teamNumber,
              channelId: channel.channelId,
              tournamentKey: slot.tournamentKey,
            },
          });
          const message = await slack(channel.workspace.authToken, {
            channel: channel.channelId,
            client_msg_id: id,
            ...(thread ? { thread_ts: thread.messageId } : {}),
            text:
              escape(author) +
              " reported team " +
              slot.teamNumber +
              " broke in Q" +
              slot.matchNumber +
              ".\n" +
              escape(report.robotBrokeDescription),
          });
          if (!thread && message.ts)
            await db.slackNotificationThread.create({
              data: {
                messageId: message.ts,
                channelId: channel.channelId,
                subscriptionId: channel.subscriptionId,
                matchNumber: slot.matchNumber,
                teamNumber: slot.teamNumber,
                tournamentKey: slot.tournamentKey,
              },
            });
        }
      }
    },
  };
}
export async function runNextEffect(
  db: PrismaClient,
  delivery: OutboxDelivery,
  now = new Date(),
): Promise<boolean> {
  const lease = randomUUID();
  const until = new Date(now.getTime() + 60000);
  const rows = await db.$queryRaw<ApiOutbox[]>`
    UPDATE "ApiOutbox" SET "leaseToken" = ${lease}, "leaseUntil" = ${until}, "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "ApiOutbox" WHERE "completedAt" IS NULL AND "attempts" < 10 AND "availableAt" <= ${now}
        AND ("leaseUntil" IS NULL OR "leaseUntil" <= ${now})
      ORDER BY CASE WHEN "kind" = 'cache.revision' THEN 0 ELSE 1 END, "availableAt", "createdAt"
      FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *`;
  const row = rows[0];
  if (!row) return false;
  try {
    const effect = effectSchema.parse(row.payload);
    if (effect.kind !== row.kind) throw new Error("Effect kind mismatch");
    await delivery.deliver(effect, row.id);
    await db.apiOutbox.updateMany({
      where: { id: row.id, leaseToken: lease },
      data: {
        completedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
      },
    });
  } catch {
    await db.apiOutbox.updateMany({
      where: { id: row.id, leaseToken: lease },
      data: {
        leaseToken: null,
        leaseUntil: null,
        lastError: "DELIVERY_FAILED",
        availableAt: new Date(
          Date.now() + Math.min(600000, 1000 * 2 ** row.attempts),
        ),
      },
    });
  }
  return true;
}
export async function maintainApiData(db: PrismaClient, now = new Date()) {
  await db.scoutReportInProgress.updateMany({
    where: {
      status: { in: ["LOADED", "STARTED", "ENDED"] },
      expiresAt: { lte: now },
    },
    data: { status: "ABANDONED" },
  });
  await db.scoutReportInProgress.updateMany({
    where: {
      status: "ABANDONED",
      expiresAt: { lte: new Date(now.getTime() - 23 * 86400000) },
      NOT: { payload: { equals: {} } },
    },
    data: { payload: {} },
  });
  const emails = await db.emailVerificationRequest.findMany({
    where: { expiresAt: { lte: now } },
    select: { verificationCode: true },
    take: 1000,
  });
  if (emails.length)
    await db.emailVerificationRequest.deleteMany({
      where: {
        verificationCode: { in: emails.map((row) => row.verificationCode) },
      },
    });
  const delivered = await db.apiOutbox.findMany({
    where: { completedAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
    select: { id: true },
    take: 1000,
  });
  if (delivered.length)
    await db.apiOutbox.deleteMany({
      where: { id: { in: delivered.map((row) => row.id) } },
    });
}
export async function runOutbox(
  db: PrismaClient,
  delivery: OutboxDelivery,
  signal: AbortSignal,
) {
  let maintained = 0;
  while (!signal.aborted) {
    try {
      if (Date.now() - maintained > 60000) {
        await maintainApiData(db);
        maintained = Date.now();
      }
      if (await runNextEffect(db, delivery)) continue;
    } catch {
      console.error("API outbox unavailable; retrying");
    }
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, 250);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}

export async function recordRevision(
  tx: import("@lovat/db").Prisma.TransactionClient,
  teamNumber: number,
) {
  const revision = await tx.analysisRevision.upsert({
    where: { teamNumber },
    create: { teamNumber, revision: 1n },
    update: { revision: { increment: 1n } },
  });
  const payload = effectSchema.parse({
    kind: "cache.revision",
    teamNumber,
    revision: revision.revision.toString(),
  });
  const dedupeKey = "analysis:" + teamNumber + ":" + revision.revision;
  await tx.apiOutbox.upsert({
    where: { dedupeKey },
    update: {},
    create: { dedupeKey, kind: payload.kind, payload },
  });
}

import z from "zod";
import { kv } from "../redisClient.js";
import {
  backgroundActivitiesReady,
  activityPushPayload,
  sendActivityPush,
} from "./apns.js";
import { scoutingActivityState } from "./schedule.js";
import type { ScoutingActivityState } from "./state.js";

export const subscriptionInput = z.object({
  installationId: z.uuid(),
  tournamentKey: z.string().min(1).max(100),
  environment: z.enum(["sandbox", "production"]),
  token: z.string().regex(/^[a-f0-9]{32,512}$/),
  kind: z.enum(["start", "update"]),
  activityId: z.string().max(128).optional(),
});

export type Subscription = {
  installationId: string;
  sourceTeamNumber: number;
  scouterUuid: string;
  tournamentKey: string;
  environment: "sandbox" | "production";
  startToken?: string;
  updateToken?: string;
  activityId?: string;
  expiresAt: number;
  lastState?: ScoutingActivityState;
  fingerprint?: string;
  lastSentAt?: number;
  startSentAt?: number;
};

export const subscriptionKey = (installationId: string): string =>
  `live-activity:${installationId}`;

export async function readSubscription(
  id: string,
): Promise<Subscription | null> {
  const raw = await kv.get(subscriptionKey(id));

  return raw ? (JSON.parse(raw.toString()) as Subscription) : null;
}

export async function saveSubscription(record: Subscription): Promise<void> {
  const remaining = Math.ceil((record.expiresAt - Date.now()) / 1000);

  if (remaining <= 0) {
    await kv.del(subscriptionKey(record.installationId));
    return;
  }

  await kv.setEx(
    subscriptionKey(record.installationId),
    JSON.stringify(record),
    remaining,
  );
}

let running = false;

export async function refreshLiveActivities(): Promise<void> {
  if (running || !backgroundActivitiesReady()) {
    return;
  }

  running = true;

  try {
    for await (const key of kv.keys("live-activity:")) {
      const raw = await kv.get(key);
      if (!raw) {
        continue;
      }

      const record: Subscription = JSON.parse(raw.toString());

      try {
        const state = await scoutingActivityState(
          record.sourceTeamNumber,
          record.scouterUuid,
          record.tournamentKey,
        );
        const expired = record.expiresAt <= Date.now();
        const event =
          !state || expired ? "end" : record.updateToken ? "update" : "start";
        const token =
          event === "start" ? record.startToken : record.updateToken;

        if (!token) {
          if (expired) {
            await kv.del(key);
          }
          continue;
        }

        const finalState = state ?? record.lastState;
        if (!finalState) {
          continue;
        }

        const fingerprint = JSON.stringify({ ...finalState, updatedAt: 0 });
        if (
          event === "update" &&
          record.fingerprint === fingerprint &&
          Date.now() - (record.lastSentAt ?? 0) < 180000
        ) {
          continue;
        }
        // A start push may already be in flight; never repeatedly start duplicates.
        if (event === "start" && record.startSentAt) {
          continue;
        }

        const status = await sendActivityPush(
          token,
          record.environment,
          activityPushPayload(event, finalState, {
            tournamentKey: record.tournamentKey,
            scouterUuid: record.scouterUuid,
          }),
        );

        if (status === 410 || status === 400) {
          await kv.del(key);
        } else if (status === 200) {
          if (event === "end") {
            await kv.del(key);
          } else {
            // Don't overwrite a token rotation/disable that arrived while sending.
            const latest = await readSubscription(record.installationId);
            if (
              latest &&
              latest.updateToken === record.updateToken &&
              latest.startToken === record.startToken
            ) {
              await saveSubscription({
                ...latest,
                fingerprint,
                lastState: finalState,
                lastSentAt: Date.now(),
                ...(event === "start" ? { startSentAt: Date.now() } : {}),
              });
            }
          }
        } else {
          console.error(`Live Activity push rejected (${status})`);
        }
      } catch {
        // Keep the subscription for retry; stale-date protects the displayed data.
        console.error("Live Activity refresh failed");
      }
    }
  } finally {
    running = false;
  }
}

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
  mascotStyle: z
    .enum(["original", "plain", "outlined", "holding"])
    .default("plain"),
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
  mascotStyle?: "original" | "plain" | "outlined" | "holding";
  expiresAt: number;
  lastState?: ScoutingActivityState;
  fingerprint?: string;
  lastSentAt?: number;
  startSentAt?: number;
  /** When the activity holding `updateToken` first registered. */
  activityStartedAt?: number;
  /** An activity this server replaced; its late token uploads are ignored. */
  retiredActivityId?: string;
};

export const REGISTRATION_TTL_MS = 8 * 60 * 60 * 1000;
// iOS ends a Live Activity after eight hours. Replace it with a push-to-start
// activity before then so a full competition day stays on the Lock Screen.
export const ACTIVITY_ROTATE_AFTER_MS = 7.5 * 60 * 60 * 1000;

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

/** Starts a replacement activity, then ends the old one. */
async function rotateActivity(
  record: Subscription,
  state: ScoutingActivityState,
  fingerprint: string,
): Promise<void> {
  const attributes = {
    tournamentKey: record.tournamentKey,
    scouterUuid: record.scouterUuid,
    mascotStyle: record.mascotStyle ?? "plain",
  };
  const status = await sendActivityPush(
    record.startToken!,
    record.environment,
    activityPushPayload("start", state, attributes),
    10,
  );
  const latest = await readSubscription(record.installationId);
  const unchanged =
    latest &&
    latest.updateToken === record.updateToken &&
    latest.startToken === record.startToken;

  if (status === 410 || status === 400) {
    // Keep updating the current activity; only the start token is unusable.
    if (unchanged) await saveSubscription({ ...latest, startToken: undefined });
    return;
  }
  if (status !== 200) {
    console.error(`Live Activity push rejected (${status})`);
    return;
  }

  // Start first: if the end fails, the scout still has the new activity.
  try {
    await sendActivityPush(
      record.updateToken!,
      record.environment,
      activityPushPayload("end", state),
      10,
    );
  } catch {
    console.error("Live Activity retirement failed");
  }

  if (unchanged) {
    const now = Date.now();
    await saveSubscription({
      ...latest,
      updateToken: undefined,
      activityId: undefined,
      activityStartedAt: undefined,
      retiredActivityId: latest.activityId,
      startSentAt: now,
      fingerprint,
      lastState: state,
      lastSentAt: now,
      // The replacement may only upload its token when iOS next wakes the app.
      expiresAt: Math.max(latest.expiresAt, now + REGISTRATION_TTL_MS),
    });
  }
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
          record.startToken &&
          record.activityStartedAt &&
          Date.now() - record.activityStartedAt >= ACTIVITY_ROTATE_AFTER_MS
        ) {
          await rotateActivity(record, finalState, fingerprint);
          continue;
        }
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
            mascotStyle: record.mascotStyle ?? "plain",
          }),
          // Match/team changes and endings need prompt delivery while locked.
          // Unchanged heartbeats use the lower priority to conserve the budget.
          event === "update" && record.fingerprint === fingerprint ? 5 : 10,
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

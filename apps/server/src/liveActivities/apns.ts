import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import type { ScoutingActivityState } from "./state.js";

let cachedAuthorization: { value: string; expires: number } | undefined;

export function backgroundActivitiesReady(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_PRIVATE_KEY,
  );
}

async function authorization(): Promise<string> {
  if (cachedAuthorization && cachedAuthorization.expires > Date.now()) {
    return cachedAuthorization.value;
  }

  const key = await importPKCS8(
    process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    "ES256",
  );
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key);

  cachedAuthorization = { value, expires: Date.now() + 40 * 60 * 1000 };

  return value;
}

export function activityPushPayload(
  event: "start" | "update" | "end",
  state: ScoutingActivityState,
  attributes?: { tournamentKey: string; scouterUuid: string },
): {
  aps: {
    timestamp: number;
    event: "start" | "update" | "end";
    "content-state": ScoutingActivityState;
    "stale-date": number;
    "dismissal-date"?: number;
    "attributes-type"?: string;
    attributes?: {
      tournamentKey?: string;
      scouterUuid?: string;
      preview: boolean;
    };
    alert?: { title: string; body: string };
  };
} {
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    aps: {
      timestamp,
      event,
      "content-state": state,
      "stale-date": timestamp + 300,
      ...(event === "end" ? { "dismissal-date": timestamp } : {}),
      ...(event === "start"
        ? {
            "attributes-type": "ScoutingActivityAttributes",
            attributes: { ...attributes, preview: false },
            alert: {
              title: "Scouting shift",
              body: "Your next scouting assignment is ready.",
            },
          }
        : {}),
    },
  };
}

export async function sendActivityPush(
  token: string,
  environment: "sandbox" | "production",
  payload: ReturnType<typeof activityPushPayload>,
): Promise<number> {
  const bearer = await authorization();
  const host =
    environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  return new Promise((resolve, reject) => {
    const client = connect(host);
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("Live Activity push timed out"));
    }, 10000);
    const finish = (error?: Error, status?: number) => {
      clearTimeout(timeout);
      client.close();
      if (error) {
        reject(error);
      } else {
        resolve(status ?? 500);
      }
    };

    client.once("error", (error) => finish(error));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${bearer}`,
      "apns-topic": "com.frc8033.lovatcollection.push-type.liveactivity",
      "apns-push-type": "liveactivity",
      "apns-priority": payload.aps.event === "start" ? "10" : "5",
      "apns-expiration": "0",
    });
    let status = 500;
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", () => {
      /* Drain Apple's response without logging device tokens. */
    });
    request.once("end", () => finish(undefined, status));
    request.once("error", (error) => finish(error));
    request.end(JSON.stringify(payload));
  });
}

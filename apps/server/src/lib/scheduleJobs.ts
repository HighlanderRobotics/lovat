import { backgroundActivitiesReady } from "../liveActivities/apns.js";
import { refreshLiveActivities } from "../liveActivities/subscriptions.js";
import { runBackgroundTask } from "./errors.js";

/** Imports and database maintenance belong to the durable Worker queue. */
export default async function scheduleJobs(): Promise<void> {
  if (!backgroundActivitiesReady()) {
    return;
  }

  // Live Activity delivery is independent of the Worker's tournament imports.
  setInterval(() => {
    void runBackgroundTask(
      refreshLiveActivities,
      "Live Activity refresh failed",
    );
  }, 30_000);
}

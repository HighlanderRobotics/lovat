import { refreshLiveActivities } from "../liveActivities/subscriptions.js";
import { runBackgroundTask } from "./errors.js";

/** Imports and database maintenance remain owned by the durable Worker queue. */
export default async function scheduleJobs(): Promise<void> {
  // Live Activity delivery is independent of the Worker's tournament imports.
  setInterval(() => {
    void runBackgroundTask(
      refreshLiveActivities,
      "Live Activity refresh failed",
    );
  }, 30_000);
}

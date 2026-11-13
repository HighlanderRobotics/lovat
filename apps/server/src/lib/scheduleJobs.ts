import fetchTeams from "./fetchTeams.js";
import fetchMatches from "./fetchMatches.js";
import prisma from "../prismaClient.js";
import expireReportsInProgress from "./expireReportsInProgress.js";
import deleteOldRequests from "./deleteOldRequests.js";
import { runBackgroundTask } from "./errors.js";

export default async function scheduleJobs(): Promise<() => void> {
  const timers: ReturnType<typeof setInterval>[] = [];
  const repeat = (task: () => void, milliseconds: number) => {
    timers.push(setInterval(task, milliseconds));
  };

  const skipTba =
    process.env.NODE_ENV === "development" && !process.env.TBA_KEY?.trim();

  if (skipTba) {
    console.log("Skipping TBA background jobs: set TBA_KEY to enable imports.");
  } else {
    // Prevent unnecessary fetching in dev mode which is frequently restarted
    if (
      process.env.NODE_ENV === "development" &&
      (await prisma.team.count()) > 0
    ) {
      console.log("Skipping initial TBA data fetch");
    } else {
      // Import teams
      console.log("Fetching teams from TBA...");
      await fetchTeams();
      console.log("Done fetching teams from TBA.");
    }

    // repeat every 24 hours
    repeat(
      () =>
        runBackgroundTask(async () => {
          console.log("Fetching teams from TBA...");
          await fetchTeams();
          console.log("Done fetching teams from TBA.");
        }, "TBA daily refresh failed"),
      1000 * 60 * 60 * 24,
    );

    //repeat hourly
    repeat(
      () =>
        runBackgroundTask(async () => {
          await fetchMatches();
          console.log("Done fetching matches from TBA.");
        }, "TBA match refresh failed"),
      1000 * 60 * 60,
    );
  }

  // repeat every 12 hours
  repeat(
    async () => {
      await runBackgroundTask(async () => {
        await deleteOldRequests();
        console.log("Done deleting old requests.");
      }, "Old request cleanup failed");
      await runBackgroundTask(
        expireReportsInProgress,
        "Report draft cleanup failed",
      );
    },
    1000 * 60 * 60 * 12,
  );
  return () => {
    for (const timer of timers) {
      clearInterval(timer);
    }
  };
}

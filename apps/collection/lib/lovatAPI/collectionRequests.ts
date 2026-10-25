import type { ScoutReport } from "../collection/ScoutReport";
import type { ScoutReportMeta } from "../models/ScoutReportMeta";

type Post = (path: string, body: unknown) => Promise<Response>;

export const checkedPost = async (post: Post, path: string, body: unknown) => {
  const response = await post(path, body);

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.displayError ?? "Could not save report. Try again.");
  }
};

export const sendReportLifecycle = async (
  post: Post,
  uuid: string,
  meta: ScoutReportMeta,
  startTime?: number,
) => {
  await checkedPost(post, "/collection/load", {
    uuid,
    teamNumber: meta.teamNumber,
    matchIdentity: {
      ...meta.matchIdentity,
      matchType:
        meta.matchIdentity.matchType === "PRACTICE"
          ? "PRACTICE"
          : meta.matchIdentity.matchType === "QUALIFIER"
            ? "QUALIFICATION"
            : "ELIMINATION",
    },
    trainingAttemptUuid: meta.collection?.trainingAttemptUuid,
  });

  if (startTime !== undefined) {
    await checkedPost(post, "/collection/start", { uuid, startTime });
  }

  if (meta.collection?.endTime !== undefined) {
    await checkedPost(post, "/collection/end", {
      uuid,
      endTime: meta.collection.endTime,
    });
  }
};

export const sendReport = async (
  post: Post,
  report: ScoutReport,
  meta?: ScoutReportMeta,
) => {
  // Reports saved before lifecycle tracking retain their original contract.
  if (!meta?.collection) {
    await checkedPost(post, "/collection/scoutreports", report);
    return;
  }

  if (meta.collection.endTime === undefined) {
    throw new Error("End the match before submitting this report.");
  }

  await sendReportLifecycle(post, report.uuid, meta, report.startTime);
  await checkedPost(
    post,
    meta.collection.trainingSessionUuid
      ? `/collection/training/${meta.collection.trainingSessionUuid}/submit`
      : "/collection/submit",
    report,
  );
};

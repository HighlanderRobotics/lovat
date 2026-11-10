import { useEffect } from "react";
import { router } from "expo-router";
import { useUrlPrefix } from "../lovatAPI/lovatAPI";
import { useReportStateStore } from "../collection/reportStateStore";
import { useTrainingSessionStore } from "./trainingStore";
import {
  connectTrainingDevice,
  trainingTimelinePlan,
} from "./deviceConnection";

export function TrainingConnection() {
  const credentials = useTrainingSessionStore((state) => state.credentials);
  useEffect(() => {
    if (!credentials) return;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const set = useTrainingSessionStore.getState().set;
    const finish = (endTime: number) => {
      const report = useReportStateStore.getState();
      if (
        report.uuid !== credentials.reportUuid ||
        !report.startTimestamp ||
        report.meta?.collection?.endTime !== undefined
      )
        return;
      report.endMatchAt(endTime);
      router.replace("/game/post-match");
    };
    const base = useUrlPrefix.getState().getUrlPrefix();
    const socketUrl = new URL(base);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.pathname = "/collection/training/socket";
    socketUrl.search = "";
    const stop = connectTrainingDevice({
      credentials,
      socketUrl: socketUrl.toString(),
      fetchSnapshot: async () => {
        const controller = new AbortController(),
          timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(
            `${base}/collection/training/sessions/${credentials.sessionUuid}?attempt=${credentials.attemptUuid}`,
            {
              headers: { Authorization: `Bearer ${credentials.token}` },
              signal: controller.signal,
            },
          );
          if (!response.ok)
            throw Object.assign(new Error("Training snapshot unavailable"), {
              status: response.status,
            });
          return await response.json();
        } finally {
          clearTimeout(timeout);
        }
      },
      onConnected: (connected) => set({ connected }),
      onError: (error) => set({ error }),
      onSnapshot: (snapshot) => {
        set({ snapshot });
        const report = useReportStateStore.getState();
        if (report.uuid !== credentials.reportUuid) return;
        const plan = trainingTimelinePlan(
          snapshot,
          report.startTimestamp?.getTime(),
          report.meta?.collection?.endTime !== undefined,
          Date.now(),
        );
        if (plan.startTime !== undefined)
          report.initializeMatchTimestamp(plan.startTime);
        if (plan.interrupted) {
          clearTimeout(endTimer);
          if (plan.endTime !== undefined) finish(plan.endTime);
          set({
            error:
              "Video playback was interrupted. This attempt cannot be submitted. Join a new session.",
          });
          return;
        }
        if (plan.endTime !== undefined) {
          clearTimeout(endTimer);
          finish(plan.endTime);
        } else if (plan.remainingMs !== undefined) {
          clearTimeout(endTimer);
          const start = useReportStateStore
            .getState()
            .startTimestamp?.getTime();
          if (start !== undefined)
            endTimer = setTimeout(
              () => finish(start + snapshot.video.durationSeconds * 1000),
              plan.remainingMs,
            );
        }
      },
    });
    return () => {
      clearTimeout(endTimer);
      stop();
    };
  }, [credentials]);
  return null;
}

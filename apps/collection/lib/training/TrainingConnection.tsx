import { useEffect } from "react";
import { router } from "expo-router";
import { useUrlPrefix } from "../lovatAPI/lovatAPI";
import { useReportStateStore } from "../collection/reportStateStore";
import { useTrainingSessionStore, TrainingSnapshot } from "./trainingStore";

export function TrainingConnection() {
  const credentials = useTrainingSessionStore((state) => state.credentials);
  useEffect(() => {
    if (!credentials) return;
    let disposed = false;
    let socket: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    let endTimer: ReturnType<typeof setTimeout>;
    const set = useTrainingSessionStore.getState().set;
    const finish = () => {
      const report = useReportStateStore.getState();
      if (
        report.uuid !== credentials.reportUuid ||
        !report.startTimestamp ||
        report.meta?.collection?.endTime !== undefined
      )
        return;
      report.endMatch();
      router.replace("/game/post-match");
    };
    const connect = () => {
      if (disposed) return;
      const url = new URL(useUrlPrefix.getState().getUrlPrefix());
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/collection/training/socket";
      socket = new WebSocket(url.toString());
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            sessionUuid: credentials.sessionUuid,
            attemptUuid: credentials.attemptUuid,
            token: credentials.token,
          }),
        );
      socket.onmessage = ({ data }) => {
        const snapshot = JSON.parse(data) as TrainingSnapshot;
        set({ snapshot, connected: true, error: null });
        const report = useReportStateStore.getState();
        if (report.uuid !== credentials.reportUuid) return;
        if (snapshot.status === "INTERRUPTED") {
          clearTimeout(endTimer);
          finish();
          set({
            error:
              "Video playback was interrupted. This attempt cannot be submitted. Join a new session.",
          });
          return;
        }
        if (
          (snapshot.status === "PLAYING" || snapshot.status === "ENDED") &&
          snapshot.startedAt !== null &&
          !report.startTimestamp
        ) {
          report.initializeMatchTimestamp(
            Date.now() - (snapshot.serverTime - snapshot.startedAt),
          );
        }
        const current = useReportStateStore.getState();
        if (snapshot.status === "ENDED") finish();
        else if (
          snapshot.status === "PLAYING" &&
          current.startTimestamp &&
          !current.meta?.collection?.endTime
        ) {
          clearTimeout(endTimer);
          endTimer = setTimeout(
            finish,
            Math.max(
              0,
              snapshot.video.durationSeconds * 1000 -
                (Date.now() - current.startTimestamp.getTime()),
            ),
          );
        }
      };
      socket.onclose = ({ code }) => {
        if (disposed) return;
        set({ connected: false });
        if (!disposed && code !== 1008) reconnect = setTimeout(connect, 2000);
        else if (!disposed)
          set({
            error: "Training session is unavailable. Join a new session.",
          });
      };
      socket.onerror = () => set({ connected: false });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearTimeout(endTimer);
      socket?.close();
    };
  }, [credentials]);
  return null;
}

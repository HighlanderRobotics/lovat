import type { TrainingSnapshot } from "./trainingStore";

type Cancel = () => void;
type Credentials = { sessionUuid: string; attemptUuid: string; token: string };
type Options = {
  credentials: Credentials;
  socketUrl: string;
  fetchSnapshot: () => Promise<unknown>;
  onSnapshot: (snapshot: TrainingSnapshot) => void;
  onConnected: (value: boolean) => void;
  onError: (message: string | null) => void;
  createSocket?: (url: string) => WebSocket;
  now?: () => number;
  repeat?: (callback: () => void, ms: number) => Cancel;
  later?: (callback: () => void, ms: number) => Cancel;
};
const phases = ["LOBBY", "ARMED", "PLAYING", "ENDED", "INTERRUPTED"];

/** Keep the same attempt and report while recovering transport. Tokens are sent
 * in the socket authentication frame or HTTP header, never in a URL. */
export function connectTrainingDevice(o: Options): Cancel {
  const now = o.now ?? Date.now,
    createSocket = o.createSocket ?? ((url) => new WebSocket(url));
  const repeat =
    o.repeat ??
    ((fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });
  const later =
    o.later ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });
  let stopped = false,
    terminal = false,
    polling = false,
    socketHealthy = false;
  let socket: WebSocket | undefined,
    cancelRetry: Cancel | undefined,
    lastReceived: number | null = null,
    lastServerTime = -Infinity,
    lastStatus = "";
  const fresh = () => lastReceived !== null && now() - lastReceived < 5000;
  function accept(raw: unknown) {
    const s = raw as TrainingSnapshot | null;
    if (
      !s ||
      s.uuid !== o.credentials.sessionUuid ||
      !phases.includes(s.status) ||
      !Number.isFinite(s.serverTime) ||
      !s.video ||
      !Number.isFinite(s.video.durationSeconds) ||
      s.video.durationSeconds <= 0 ||
      s.video.durationSeconds > 600 ||
      !Array.isArray(s.participants) ||
      s.participants.length !== 1 ||
      s.participants[0].uuid !== o.credentials.attemptUuid ||
      (s.startedAt !== null && !Number.isFinite(s.startedAt))
    ) {
      throw new Error("Invalid training snapshot");
    }
    if (
      s.serverTime < lastServerTime ||
      phases.indexOf(s.status) < phases.indexOf(lastStatus) ||
      (["ENDED", "INTERRUPTED"].includes(lastStatus) && s.status !== lastStatus)
    )
      return;
    lastServerTime = s.serverTime;
    lastStatus = s.status;
    lastReceived = now();
    o.onConnected(true);
    o.onError(null);
    o.onSnapshot(s);
  }
  function detach() {
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
      socket = undefined;
    }
  }
  function deny() {
    terminal = true;
    cancelRetry?.();
    detach();
    o.onConnected(false);
    o.onError("Training session is unavailable. Join a new session.");
  }
  async function poll() {
    if (stopped || terminal) return;
    o.onConnected(fresh());
    if (
      polling ||
      (socketHealthy && lastReceived !== null && now() - lastReceived < 3000)
    )
      return;
    polling = true;
    try {
      const value = await o.fetchSnapshot();
      if (!stopped && !terminal) accept(value);
    } catch (error) {
      if (!stopped && !terminal) {
        const status = (error as { status?: number })?.status;
        if ([401, 403, 404, 410].includes(status ?? 0)) deny();
        else if (!fresh()) o.onError("Reconnecting to training…");
      }
    } finally {
      polling = false;
    }
  }
  function retry() {
    cancelRetry?.();
    if (!stopped && !terminal) cancelRetry = later(connect, 2000);
  }
  function connect() {
    if (stopped || terminal) return;
    detach();
    socketHealthy = false;
    try {
      const active = createSocket(o.socketUrl);
      socket = active;
      active.onopen = () => {
        if (!stopped && socket === active)
          active.send(JSON.stringify(o.credentials));
      };
      active.onmessage = ({ data }) => {
        if (stopped || terminal || socket !== active) return;
        try {
          if (typeof data !== "string") throw new Error("Invalid snapshot");
          accept(JSON.parse(data));
          socketHealthy = true;
        } catch {
          socketHealthy = false;
          void poll();
        }
      };
      active.onclose = ({ code }) => {
        if (stopped || socket !== active) return;
        socketHealthy = false;
        if (code === 1008) deny();
        else {
          void poll();
          retry();
        }
      };
      active.onerror = () => {
        if (!stopped && socket === active) {
          socketHealthy = false;
          void poll();
          retry();
        }
      };
    } catch {
      void poll();
      retry();
    }
  }
  const stopPolling = repeat(() => void poll(), 1500);
  void poll();
  connect();
  return () => {
    stopped = true;
    cancelRetry?.();
    stopPolling();
    detach();
  };
}

export function trainingTimelinePlan(
  snapshot: TrainingSnapshot,
  localStart: number | undefined,
  finished: boolean,
  now: number,
) {
  if (finished) return {};
  if (snapshot.status === "INTERRUPTED")
    return {
      interrupted: true,
      endTime:
        localStart === undefined
          ? undefined
          : Math.min(now, localStart + snapshot.video.durationSeconds * 1000),
    };
  if (
    !["PLAYING", "ENDED"].includes(snapshot.status) ||
    snapshot.startedAt === null
  )
    return {};
  const elapsed = Math.max(0, snapshot.serverTime - snapshot.startedAt);
  const startTime = localStart ?? now - elapsed;
  const endTime = startTime + snapshot.video.durationSeconds * 1000;
  return {
    startTime: localStart === undefined ? startTime : undefined,
    endTime:
      snapshot.status === "ENDED" ||
      elapsed >= snapshot.video.durationSeconds * 1000
        ? endTime
        : undefined,
    remainingMs: Math.max(0, snapshot.video.durationSeconds * 1000 - elapsed),
  };
}

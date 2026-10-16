import type { ScoutReportMeta } from "../models/ScoutReportMeta";
import { post } from "./lovatAPI";
import { sendReportLifecycle } from "./collectionRequests";
import { useTeamStore } from "../storage/userStores";

export const reportPost = (meta: ScoutReportMeta) => {
  const team = useTeamStore.getState();

  if (meta.collection && meta.collection.sourceTeamNumber !== team.number) {
    throw new Error("Switch to the report's original team before uploading.");
  }

  // Capture ownership before a request starts; queued reports may belong to a
  // different scout than the one currently selected on this device.
  const headers = {
    "X-Team-Code": team.code,
    "X-Scouter-UUID": meta.scouterUUID,
  };

  return (path: string, body: unknown) => post(path, body, headers);
};

const pending = new Map<string, Promise<void>>();

export const queueReportRequest = (
  uuid: string,
  action: () => Promise<void>,
) => {
  const previous = pending.get(uuid) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pending.set(uuid, next);

  void next
    .finally(() => {
      if (pending.get(uuid) === next) {
        pending.delete(uuid);
      }
    })
    .catch(() => undefined);

  return next;
};

export const syncReportLifecycle = async (
  uuid: string,
  meta: ScoutReportMeta,
  startTime?: number,
) => {
  const request = reportPost(meta);
  return queueReportRequest(uuid, () =>
    sendReportLifecycle(request, uuid, meta, startTime),
  );
};

import type { ScoutReport } from "../collection/ScoutReport";
import type { ScoutReportMeta } from "../models/ScoutReportMeta";
import { post } from "./lovatAPI";
import { sendReport } from "./collectionRequests";
import { queueReportRequest, reportPost } from "./reportLifecycle";

export const uploadReport = async (
  report: ScoutReport,
  meta?: ScoutReportMeta,
) => {
  const request = meta
    ? reportPost(meta)
    : (path: string, body: unknown) =>
        post(path, body, { "X-Scouter-UUID": report.scouterUuid });

  await queueReportRequest(report.uuid, () =>
    sendReport(request, report, meta),
  );
};

import type { ScoutReport } from "./ScoutReport";

export type ReportChunk = {
  index: number;
  total: number;
  data: string;
  uuid: string;
};

export function splitScoutReportIntoCodes(
  scoutReport: ScoutReport,
  maxCodeLength: number,
): ReportChunk[] {
  if (!Number.isInteger(maxCodeLength) || maxCodeLength <= 0) {
    throw new Error("QR chunk length must be a positive integer");
  }
  const json = JSON.stringify(scoutReport);
  const chunks: ReportChunk[] = [];

  for (let i = 0; i < json.length; i += maxCodeLength) {
    chunks.push({
      index: i,
      total: Math.ceil(json.length / maxCodeLength),
      data: json.slice(i, i + maxCodeLength),
      uuid: scoutReport.uuid,
    });
  }

  return chunks;
}

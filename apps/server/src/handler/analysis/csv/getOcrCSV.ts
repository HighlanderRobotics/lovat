import type { Response } from "express";
import { stringify } from "csv-stringify/sync";
import type { AuthenticatedRequest } from "../../../lib/middleware/requireAuth.js";
import {
  canExportTournament,
  exportQuery,
  ocrMatrix,
  tournamentResults,
} from "./tournamentResults.js";
export async function getOcrCSV(req: AuthenticatedRequest, res: Response) {
  const parsed = exportQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).send({ displayError: "Invalid export parameters." });
    return;
  }
  if (!canExportTournament(req.user, parsed.data.tournamentKey)) {
    res
      .status(403)
      .send({ displayError: "Tournament outside your data sources." });
    return;
  }
  try {
    const data = await tournamentResults(req.user, parsed.data.tournamentKey);
    const { columns, rows } = ocrMatrix(
      data,
      req.query.auto !== undefined,
      req.query.teleop !== undefined,
    );
    res.attachment(`${parsed.data.tournamentKey}-ocr.csv`);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.send(
      stringify(rows, {
        columns,
        header: true,
        bom: true,
        escape_formulas: true,
      }),
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
}

import { getOcrCSV } from "../../handler/analysis/csv/getOcrCSV.js";
import { exportQuery } from "../../handler/analysis/csv/tournamentResults.js";
import { Router } from "express";
import { getReportCSV } from "../../handler/analysis/csv/getReportCSV.js";
import { getTeamCSV } from "../../handler/analysis/csv/getTeamCSV.js";
import { registry } from "../../lib/openapi.js";
import { z } from "zod";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";

const router = Router();

registry.registerPath({
  method: "get",
  path: "/v1/analysis/csvplain",
  tags: ["Analysis - CSV"],
  summary: "Team CSV",
  request: {
    query: exportQuery,
  },
  responses: {
    200: {
      description: "CSV",
      content: { "text/csv": { schema: z.string() } },
    },
    400: { description: "Invalid parameters or not enough scouting data" },
    500: { description: "Internal server error" },
  },
  security: [{ bearerAuth: [] }],
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/reportcsv",
  tags: ["Analysis - CSV"],
  summary: "Report CSV",
  request: { query: exportQuery },
  responses: {
    200: {
      description: "CSV",
      content: { "text/csv": { schema: z.string() } },
    },
    400: { description: "Invalid parameters or not enough scouting data" },
    500: { description: "Internal server error" },
  },
  security: [{ bearerAuth: [] }],
});

registry.registerPath({
  method: "get",
  path: "/v1/analysis/ocrcsv",
  tags: ["Analysis - CSV"],
  summary: "OCR + report team-by-match matrix; missing estimates are blank",
  request: { query: exportQuery },
  responses: {
    200: {
      description: "CSV",
      content: { "text/csv": { schema: z.string() } },
    },
    400: { description: "Invalid parameters" },
    403: { description: "Tournament outside data sources" },
  },
  security: [{ bearerAuth: [] }],
});
router.use(requireVerifiedTeam);

router.get("/ocrcsv", getOcrCSV);
router.get("/csvplain", getTeamCSV);
router.get("/reportcsv", getReportCSV);

export default router;

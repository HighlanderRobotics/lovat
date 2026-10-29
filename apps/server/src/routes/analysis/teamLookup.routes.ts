import {
  matchEstimates,
  ocrMatchParams,
  ocrMatchResponse,
} from "../../handler/analysis/teamLookUp/matchEstimates.js";
import { Router } from "express";
import { teamEstimates } from "../../handler/analysis/teamLookUp/teamEstimates.js";
import { breakdownDetails } from "../../handler/analysis/teamLookUp/breakdownDetails.js";
import { breakdownMetrics } from "../../handler/analysis/teamLookUp/breakdownMetrics.js";
import { categoryMetrics } from "../../handler/analysis/teamLookUp/categoryMetrics.js";
import { detailsPage } from "../../handler/analysis/teamLookUp/detailsPage.js";
import { getNotes } from "../../handler/analysis/teamLookUp/getNotes.js";
import { multipleFlags } from "../../handler/analysis/teamLookUp/multipleFlags.js";
import { registry } from "../../lib/openapi.js";
import { z } from "zod";

const router = Router();

const TeamParam = z.object({ team: z.string() });
const MetricTeamParam = z.object({ metric: z.string(), team: z.string() });
const BreakdownParam = z.object({ team: z.string(), breakdown: z.string() });

registry.registerPath({
  method: "get",
  path: "/v1/analysis/estimates/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Combined OCR and report estimates for a team",
  request: { params: z.object({ team: z.coerce.number().int().positive() }) },
  responses: {
    200: {
      description: "Source-scoped summary and one estimate per match",
      content: {
        "application/json": {
          schema: z.object({
            team: z.number(),
            scoreSource: z.literal("combined"),
            sampleCount: z.number().int(),
            archivedSamples: z.number().int(),
            averagePoints: z.number().nullable(),
            autoPoints: z.number().nullable(),
            teleopPoints: z.number().nullable(),
            averageFuel: z.number().nullable(),
            scoutAverage: z.number().nullable(),
            ocrAdjustment: z.number().nullable(),
            matches: z.array(
              z.object({
                matchKey: z.string(),
                tournamentKey: z.string(),
                tournamentName: z.string(),
                label: z.string(),
                matchNumber: z.number(),
                setNumber: z.number(),
                competitionLevel: z.string(),
                autoPoints: z.number(),
                teleopPoints: z.number(),
                totalPoints: z.number(),
                totalFuel: z.number(),
                scoutAverage: z.number().nullable(),
                ocrAdjustment: z.number().nullable(),
                archived: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    400: { description: "Invalid team number" },
    401: { description: "Unauthorized" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/analysis/metric/{metric}/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Metric details for team",
  request: { params: MetricTeamParam },
  responses: {
    200: {
      description: "Details",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/category/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Category metrics for team",
  request: { params: TeamParam },
  responses: {
    200: {
      description: "Categories",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/breakdown/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Breakdown metrics for team",
  request: { params: TeamParam },
  responses: {
    200: {
      description: "Breakdown",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/breakdown/team/{team}/{breakdown}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Specific breakdown details",
  request: { params: BreakdownParam },
  responses: {
    200: {
      description: "Details",
      content: {
        "application/json": { schema: z.record(z.string(), z.any()) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/notes/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Notes for team",
  request: { params: TeamParam },
  responses: {
    200: {
      description: "Notes",
      content: {
        "application/json": { schema: z.array(z.object({ note: z.string() })) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});
registry.registerPath({
  method: "get",
  path: "/v1/analysis/flag/team/{team}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "Flags for team",
  request: { params: TeamParam },
  responses: {
    200: {
      description: "Flags",
      content: {
        "application/json": { schema: z.array(z.object({ flag: z.string() })) },
      },
    },
    400: { description: "Invalid parameters" },
    500: { description: "Internal server error" },
  },
});

router.get("/metric/:metric/team/:team", detailsPage);
router.get("/estimates/team/:team", teamEstimates);
router.get("/category/team/:team", categoryMetrics);
router.get("/breakdown/team/:team", breakdownMetrics);
router.get("/breakdown/team/:team/:breakdown", breakdownDetails);
router.get("/notes/team/:team", getNotes);
router.get("/flag/team/:team", multipleFlags);

export default router;

registry.registerPath({
  method: "get",
  path: "/v1/analysis/estimates/match/{matchKey}",
  security: [{ bearerAuth: [] }],
  tags: ["Analysis - Team Lookup"],
  summary: "OCR match timeline and source-scoped contributions",
  request: { params: ocrMatchParams },
  responses: {
    200: {
      description: "Observed alliance fuel and available estimates",
      content: { "application/json": { schema: ocrMatchResponse } },
    },
    400: { description: "Invalid match key" },
    401: { description: "Unauthorized" },
    500: { description: "Analysis failed" },
  },
});
router.get("/estimates/match/:matchKey", matchEstimates);

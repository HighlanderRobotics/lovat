import { z } from "zod";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export function registerSlackPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/v1/slack/add-workspace",
    tags: ["Slack"],
    summary: "Add Slack workspace (OAuth flow)",
    responses: { 200: { description: "Redirect or JSON" } },
    security: [{ slackToken: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/slack/command",
    tags: ["Slack"],
    summary: "Slack slash command",
    request: {
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.object({
              command: z.string(),
              text: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Processed" } },
    security: [{ slackToken: [] }],
  });
  registry.registerPath({
    method: "post",
    path: "/v1/slack/event",
    tags: ["Slack"],
    summary: "Slack event callback",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              type: z.string(),
              event: z.record(z.string(), z.any()),
            }),
          },
        },
      },
    },
    responses: { 200: { description: "Processed" } },
    security: [{ slackToken: [] }],
  });
}

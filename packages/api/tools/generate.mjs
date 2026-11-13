import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { apiErrorSchema, reportSchema, routes } from "../dist/index.js";

const schema = (value) => z.toJSONSchema(value, { target: "draft-2020-12" });
const paths = {};
for (const [operationId, route] of Object.entries(routes)) {
  paths[route.path] ??= {};
  paths[route.path][route.method.toLowerCase()] = {
    operationId,
    security: route.auth === "public" ? [] : [{ bearerAuth: [] }],
    ...(route.method === "POST"
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: schema(route.input) },
            },
          },
        }
      : {}),
    responses: Object.fromEntries(
      [200, 400, 401, 403, 413, 429, 500, 503].map((status) => [
        status,
        {
          description: status === 200 ? "Success" : "Request failed",
          content: {
            "application/json": {
              schema: schema(status === 200 ? route.output : apiErrorSchema),
            },
          },
        },
      ]),
    ),
  };
}
const document = {
  openapi: "3.1.0",
  info: { title: "Lovat API", version: "0.1.0" },
  paths,
  components: {
    schemas: {
      ApiError: schema(apiErrorSchema),
      ReportSubmission: schema(reportSchema),
    },
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
  },
};
const content = `${JSON.stringify(document, null, 2)}\n`;
const destination = new URL("../openapi.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== content)
    throw new Error("Run npm run generate: API contract drift detected");
} else {
  await writeFile(destination, content);
}

const { createLegacyOpenApiDocument } = await import("../dist/legacy/index.js");
const legacyContent =
  JSON.stringify(
    createLegacyOpenApiDocument({
      version: "26.0.0",
      baseUrl: "https://api.lovat.app",
    }),
    null,
    2,
  ) + "\n";
const legacyDestination = new URL("../openapi.legacy.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(legacyDestination, "utf8")) !== legacyContent)
    throw new Error("Legacy contract drift: run npm run generate");
} else await writeFile(legacyDestination, legacyContent);

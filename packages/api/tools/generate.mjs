import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { apiErrorSchema, reportSchema, routes } from "../dist/index.js";
const definitions = {};
function schema(value, name) {
  const raw = z.toJSONSchema(value, { target: "draft-2020-12" });
  const rewrite = (node) => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "$defs")
        .map(([key, entry]) => [
          key,
          key === "$ref" &&
          typeof entry === "string" &&
          entry.startsWith("#/$defs/")
            ? "#/components/schemas/" +
              name +
              "_" +
              entry.slice("#/$defs/".length)
            : rewrite(entry),
        ]),
    );
  };
  for (const [key, entry] of Object.entries(raw.$defs ?? {}))
    definitions[name + "_" + key] = rewrite(entry);
  return rewrite(raw);
}
const paths = {};
for (const [operationId, route] of Object.entries(routes)) {
  const requestSchema = schema(route.input, operationId + "Request");
  const responseSchema = schema(route.output, operationId + "Response");
  const errorSchema = schema(apiErrorSchema, "ApiError");
  const parameters =
    route.method === "GET"
      ? Object.entries(requestSchema.properties ?? {}).map(
          ([name, property]) => ({
            in: "query",
            name,
            required: (requestSchema.required ?? []).includes(name),
            schema: property,
          }),
        )
      : [];
  if (route.auth === "collection")
    parameters.push(
      ...["X-Scouter-Uuid", "X-Device-Id"].map((name) => ({
        in: "header",
        name,
        required: true,
        schema: { type: "string", minLength: 1 },
      })),
    );
  paths[route.path] ??= {};
  const success = operationId === "submitGameReport" ? [200, 201] : [200];
  paths[route.path][route.method.toLowerCase()] = {
    operationId,
    security:
      route.auth === "public"
        ? []
        : route.auth === "collection"
          ? [{ collectionCode: [] }]
          : [{ bearerAuth: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(route.method === "POST"
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: requestSchema } },
          },
        }
      : {}),
    responses: Object.fromEntries(
      [...success, 400, 401, 403, 409, 413, 422, 429, 500, 503].map(
        (status) => [
          status,
          {
            description: success.includes(status)
              ? "Success"
              : "Request failed",
            content: {
              "application/json": {
                schema: success.includes(status) ? responseSchema : errorSchema,
              },
            },
          },
        ],
      ),
    ),
  };
}
const components = {
  ApiError: schema(apiErrorSchema, "ApiError"),
  ReportSubmission: schema(reportSchema, "ReportSubmission"),
};
const document = {
  openapi: "3.1.0",
  info: { title: "Lovat API", version: "0.1.0" },
  paths,
  components: {
    schemas: { ...components, ...definitions },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      collectionCode: { type: "apiKey", in: "header", name: "X-Team-Code" },
    },
  },
};
const content = JSON.stringify(document, null, 2) + "\n",
  destination = new URL("../openapi.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== content)
    throw Error("Run npm run generate: API contract drift detected");
} else await writeFile(destination, content);
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
    throw Error("Legacy contract drift: run npm run generate");
} else await writeFile(legacyDestination, legacyContent);

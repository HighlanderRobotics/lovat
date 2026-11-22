import { createLegacyOpenApiDocument } from "@lovat/api/legacy";
import pkg from "../../package.json" with { type: "json" };

export { apiErrorSchema as ApiErrorSchema } from "@lovat/api";

export function generateOpenApiDocument() {
  return createLegacyOpenApiDocument({
    version: pkg.version,
    baseUrl: process.env.BASE_URL || "https://api.lovat.app",
  });
}

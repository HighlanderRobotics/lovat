import { afterEach, expect, it, vi } from "vitest";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { generateOpenApiDocument } from "../src/lib/openapi.js";

afterEach(() => vi.restoreAllMocks());
it("preserves referenced/default/success responses while filling sparse error documentation", () => {
  const originalDefault = { description: "Existing default" };
  const success = { description: "OK", content: { "text/plain": {} } };
  const referenced = { $ref: "#/components/responses/Existing" };
  const wildcard = { description: "Client error", headers: { Retry: {} } };
  const generated = {
    paths: {
      "/absent": undefined,
      "/empty": { get: {} },
      "/mixed": {
        post: {
          responses: {
            "200": success,
            "400": referenced,
            "401": undefined,
            "4XX": wildcard,
            default: originalDefault,
          },
        },
      },
    },
  };
  vi.spyOn(OpenApiGeneratorV31.prototype, "generateDocument").mockReturnValue(
    generated as never,
  );
  const document = generateOpenApiDocument();
  expect(document.paths?.["/mixed"]?.post?.responses).toMatchObject({
    "200": success,
    "400": referenced,
    default: originalDefault,
    "4XX": {
      description: "Client error",
      headers: { Retry: {} },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiError" },
        },
      },
    },
  });
  expect(document.paths?.["/empty"]?.get?.responses?.default).toEqual({
    $ref: "#/components/responses/ApiErrorResponse",
  });
});
it("supports a document with no registered paths", () => {
  vi.spyOn(OpenApiGeneratorV31.prototype, "generateDocument").mockReturnValue(
    {} as never,
  );
  expect(generateOpenApiDocument().paths).toBeUndefined();
});

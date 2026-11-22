import { expect, it } from "vitest";
import { normalizeLegacyErrorResponses } from "@lovat/api/legacy";

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
  const document = normalizeLegacyErrorResponses(generated as never);
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
  expect(normalizeLegacyErrorResponses({} as never).paths).toBeUndefined();
});

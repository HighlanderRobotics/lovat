import { describe, expect, it } from "vitest";

import {
  extractJsonObject,
  ModelResponseError,
  parseModelResponse,
  reviewResponseJsonSchema,
} from "../src/response.js";
import { modelResponse, rawFinding } from "./helpers.js";

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"findings":[]}')).toEqual({ findings: [] });
  });

  it("unwraps fenced JSON", () => {
    expect(
      extractJsonObject('```json\n{"findings":[],"assessment":"ok"}\n```'),
    ).toEqual({ findings: [], assessment: "ok" });
  });

  it("finds JSON surrounded by prose", () => {
    expect(
      extractJsonObject('Here is the review:\n{"findings":[]}\nThanks.'),
    ).toEqual({ findings: [] });
  });

  it("rejects empty and malformed responses", () => {
    expect(() => extractJsonObject("")).toThrow(ModelResponseError);
    expect(() => extractJsonObject("no json here")).toThrow(ModelResponseError);
    expect(() => extractJsonObject('{"findings":')).toThrow(ModelResponseError);
  });
});

describe("parseModelResponse", () => {
  it("validates a complete response", () => {
    const parsed = parseModelResponse(
      modelResponse([rawFinding()], "Overall this is risky."),
    );

    expect(parsed.assessment).toBe("Overall this is risky.");
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({
      severity: "HIGH",
      category: "BUG",
      file: "src/report.ts",
      line: 12,
    });
    expect(parsed.invalidFindings).toBe(0);
  });

  it("defaults a missing assessment and accepts an empty finding list", () => {
    const parsed = parseModelResponse('{"findings":[]}');
    expect(parsed.assessment).toBe("");
    expect(parsed.findings).toEqual([]);
  });

  it("normalizes lowercase enums and clamps numeric values", () => {
    const parsed = parseModelResponse(
      modelResponse([
        rawFinding({
          severity: "critical",
          category: "security",
          confidence: 1.7,
          line: 12.9,
        }),
      ]),
    );

    expect(parsed.findings[0]).toMatchObject({
      severity: "CRITICAL",
      category: "SECURITY",
      confidence: 1,
      line: 12,
    });
  });

  it("drops individual invalid findings but keeps valid ones", () => {
    const parsed = parseModelResponse(
      modelResponse([
        rawFinding(),
        { severity: "URGENT", category: "BUG", title: "Bad enum" },
      ]),
    );

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.invalidFindings).toBe(1);
  });

  it("fails when every finding is invalid", () => {
    expect(() =>
      parseModelResponse(modelResponse([{ severity: "URGENT" }])),
    ).toThrow(/did not match the required schema/);
  });

  it("fails when the envelope is missing findings", () => {
    expect(() => parseModelResponse('{"assessment":"ok"}')).toThrow(
      ModelResponseError,
    );
  });

  it("publishes a strict structured-output schema", () => {
    expect(reviewResponseJsonSchema.required).toEqual([
      "assessment",
      "findings",
    ]);
    expect(reviewResponseJsonSchema.additionalProperties).toBe(false);
    expect(
      reviewResponseJsonSchema.properties.findings.items.required,
    ).toContain("confidence");
  });
});

import { describe, expect, it } from "vitest";
import z from "zod";
import { normalizeError } from "../src/lib/errors.js";
import {
  dataSourceRuleToArray,
  dataSourceRuleToPrismaFilter,
  parseStoredSourceRule,
} from "../src/handler/analysis/dataSourceRule.js";

describe("data-source rules", () => {
  it.each([
    null,
    { mode: "unknown", items: [] },
    { mode: "INCLUDE", items: ["wrong-type"] },
  ])("reports corrupt stored visibility as a server error (%j)", (value) => {
    let failure: unknown;
    try {
      parseStoredSourceRule(z.number(), value);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(normalizeError(failure)).toMatchObject({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
    });
  });
  it("preserves valid stored visibility rules", () => {
    expect(
      parseStoredSourceRule(z.number(), { mode: "INCLUDE", items: [8033] }),
    ).toEqual({ mode: "INCLUDE", items: [8033] });
    expect(
      parseStoredSourceRule(z.string(), { mode: "EXCLUDE", items: [] }),
    ).toEqual({ mode: "EXCLUDE", items: [] });
  });
  it("treats an empty INCLUDE rule as no authorized sources", () => {
    const rule = { mode: "INCLUDE" as const, items: [] as number[] };
    expect(dataSourceRuleToPrismaFilter(rule)).toEqual({ in: [] });
    expect(dataSourceRuleToArray(rule, [100, 200])).toEqual([]);
  });

  it("treats an empty EXCLUDE rule as unrestricted", () => {
    const rule = { mode: "EXCLUDE" as const, items: [] as number[] };
    expect(dataSourceRuleToPrismaFilter(rule)).toBeUndefined();
    expect(dataSourceRuleToArray(rule, [100, 200])).toEqual([100, 200]);
  });

  it("keeps nonempty INCLUDE and EXCLUDE filters distinct", () => {
    expect(
      dataSourceRuleToPrismaFilter({ mode: "INCLUDE", items: [100] }),
    ).toEqual({ in: [100] });
    expect(
      dataSourceRuleToPrismaFilter({ mode: "EXCLUDE", items: [100] }),
    ).toEqual({ notIn: [100] });
  });
});
it("filters nonempty inclusion and exclusion lists", () => {
  expect(
    dataSourceRuleToArray({ mode: "INCLUDE", items: [100] }, [100, 200]),
  ).toEqual([100]);
  expect(
    dataSourceRuleToArray({ mode: "EXCLUDE", items: [100] }, [100, 200]),
  ).toEqual([200]);
});
it("handles missing scalar rules and rejects unsupported array rule modes", () => {
  expect(dataSourceRuleToPrismaFilter(null)).toBeUndefined();
  expect(
    dataSourceRuleToArray({ mode: "invalid" as "INCLUDE", items: [] }, [100]),
  ).toEqual([]);
});

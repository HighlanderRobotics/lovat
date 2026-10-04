import { describe, expect, it } from "vitest";
import {
  dataSourceRuleToArray,
  dataSourceRuleToPrismaFilter,
} from "../src/handler/analysis/dataSourceRule.js";

describe("data-source rules", () => {
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

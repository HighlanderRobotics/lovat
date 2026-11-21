import { describe, expect, it } from "vitest";

import { trimTrailingSlashes } from "../src/index.js";

describe("trimTrailingSlashes", () => {
  it("leaves a value without trailing slashes unchanged", () => {
    expect(trimTrailingSlashes("https://github.com")).toBe("https://github.com");
  });

  it("removes every trailing slash", () => {
    expect(trimTrailingSlashes("https://github.com///")).toBe(
      "https://github.com",
    );
  });

  it("handles a value made only of slashes", () => {
    expect(trimTrailingSlashes("///")).toBe("");
  });
});

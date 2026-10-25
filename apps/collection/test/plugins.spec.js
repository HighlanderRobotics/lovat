/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads these migrated CommonJS regressions and native mocks synchronously. */
const { test, expect } = require("@jest/globals");
jest.mock("expo/config-plugins", () => ({
  withDangerousMod: jest.fn((config, [, apply]) => apply(config)),
  withPodfile: jest.fn((config, apply) => apply(config)),
}));
jest.mock("node:fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
const fs = require("node:fs/promises");
const availability = require("../plugins/with-ios-menu-availability.cjs");
const resourceTargets = require("../plugins/with-ios-resource-targets.cjs");
test("resource patches are idempotent and fail clearly when Podfile structure changes", () => {
  const config = {
    modResults: { contents: "post_install do |installer|\nend" },
  };
  expect(resourceTargets(config)).toBe(config);
  expect(config.modResults.contents).toContain(
    "Gem::Version.new(min_ios_version_supported)",
  );
  const once = config.modResults.contents;
  resourceTargets(config);
  expect(config.modResults.contents).toBe(once);
  expect(() =>
    resourceTargets({ modResults: { contents: "no hook" } }),
  ).toThrow("Cannot find");
});
test("menu patches update both availability guards, preserve already patched files, and reject unexpected dependency changes", async () => {
  fs.readFile
    .mockResolvedValueOnce(
      "if #available(iOS 15.0, *) {\n      action.subtitle",
    )
    .mockResolvedValueOnce(
      "if #available(iOS 15.0, *),\n       let subtitle = self.menuSubtitle",
    );
  const config = { modRequest: { projectRoot: "/synthetic" } };
  await expect(availability(config)).resolves.toBe(config);
  expect(fs.writeFile).toHaveBeenCalledTimes(2);
  expect(fs.writeFile.mock.calls[0][1]).toContain("iOS 16.0");
  fs.readFile
    .mockResolvedValueOnce(
      "if #available(iOS 16.0, *) {\n      action.subtitle",
    )
    .mockResolvedValueOnce(
      "if #available(iOS 16.0, *),\n       let subtitle = self.menuSubtitle",
    );
  await availability(config);
  expect(fs.writeFile).toHaveBeenCalledTimes(2);
  fs.readFile.mockResolvedValueOnce("dependency changed");
  await expect(availability(config)).rejects.toThrow("no longer matches");
});

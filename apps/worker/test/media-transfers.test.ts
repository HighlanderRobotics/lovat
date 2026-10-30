import { expect, test } from "bun:test";
import { prepareMediaTransfers } from "../tools/prepare-media-transfers";

test("private media transfer caps are PUT-only, scoped, bounded and skip existing objects", async () => {
  const calls: unknown[] = [];
  const store = { file(key: string) { return {
    exists: async () => key.includes("BBBBBBBBBBB"),
    presign(options: { method: "PUT"; expiresIn: number }) {
      calls.push({ key, ...options }); return "https://example.invalid/scoped-test-capability";
    },
  }; } };
  const result = await prepareMediaTransfers(store, ["AAAAAAAAAAA", "BBBBBBBBBBB"], 301000, 1000);
  expect(calls).toEqual([{ key: "media/2026cacg/AAAAAAAAAAA.mp4", method: "PUT", expiresIn: 300 }]);
  expect(result[1]).toMatchObject({ exists: true });
  expect(result[1]).not.toHaveProperty("putUrl");
  expect(result[0]!.expiresAt).toBe(301000);
  for (const videos of [[], ["../bad"], ["AAAAAAAAAAA", "AAAAAAAAAAA"]])
    await expect(prepareMediaTransfers(store, videos, 301000, 1000)).rejects.toThrow("explicit");
  await expect(prepareMediaTransfers(store, ["AAAAAAAAAAA"], 1000, 1000)).rejects.toThrow("deadline");
  await expect(prepareMediaTransfers(store, ["AAAAAAAAAAA"], 3602000, 1000)).rejects.toThrow("deadline");
  expect(calls).toHaveLength(1);
});

import { expect, test } from "bun:test";
import { authorize, relay } from "../tools/media-relay";
const token = "a".repeat(64);
test("upload signer requires a nonexpired strong bearer token", () => {
  const req = (v: string) =>
    new Request("https://example.test/sign", { headers: { authorization: v } });
  expect(authorize(req(`Bearer ${token}`), token, Date.now() + 10000)).toBe(
    true,
  );
  expect(authorize(req(`Bearer ${token}`), token, Date.now() - 1)).toBe(false);
  expect(
    authorize(req(`Bearer ${"b".repeat(64)}`), token, Date.now() + 10000),
  ).toBe(false);
  expect(authorize(req(""), token, Date.now() + 10000)).toBe(false);
  expect(authorize(req("Bearer short"), "short", Date.now() + 10000)).toBe(
    false,
  );
});
test("signer exposes no objects or signing URLs without authorization", async () => {
  const response = await relay(
    new Request("https://example.test/sign", {
      method: "POST",
      body: '{"videoKey":"abcdefghijk"}',
    }),
  );
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("Unauthorized");
});

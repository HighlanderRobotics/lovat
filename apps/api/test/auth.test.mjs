import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthenticator } from "../dist/auth.js";
const user = {
  id: "auth0|test",
  teamNumber: 8033,
  role: "ANALYST",
  team: { emailVerified: true },
  teamSourceRule: { mode: "INCLUDE", items: [] },
  tournamentSourceRule: { mode: "EXCLUDE", items: [] },
};
function auth(value = user, verify = async () => ({ sub: user.id })) {
  return createAuthenticator(
    { userById: async () => value },
    {
      issuer: "https://issuer.example/",
      audience: "lovat",
      verify,
    },
  );
}
test("valid JWT identity uses authoritative source rules without provisioning writes", async () => {
  const scope = await auth()("Bearer token");
  assert.equal(scope.userId, user.id);
  assert.deepEqual(scope.sources.teams, { mode: "INCLUDE", items: [] });
});
test("invalid, absent and subjectless tokens fail closed", async () => {
  await assert.rejects(auth()(undefined), { status: 401 });
  await assert.rejects(auth()("Bearer lvt-key"), { code: "JWT_REQUIRED" });
  await assert.rejects(
    auth(user, async () => {
      throw new Error("secret");
    })("Bearer token"),
    { code: "UNAUTHORIZED" },
  );
  await assert.rejects(auth(user, async () => ({}))("Bearer token"), {
    status: 401,
  });
});
test("missing identity, unverified team and corrupt scope never grant access", async () => {
  await assert.rejects(auth(null)("Bearer token"), {
    code: "IDENTITY_NOT_PROVISIONED",
  });
  await assert.rejects(
    auth({ ...user, team: { emailVerified: false } })("Bearer token"),
    { status: 403 },
  );
  await assert.rejects(auth({ ...user, teamSourceRule: {} })("Bearer token"), {
    code: "INVALID_ACCESS_SCOPE",
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createJwtVerifier } from "../dist/auth.js";
import { createProvisioner } from "../dist/provision.js";

test("JWT verification uses real signatures and cached JWKS while rejecting invalid claims", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "fixture",
    alg: "RS256",
    use: "sig",
  };
  let fetches = 0;
  const issuer = "https://auth.test.invalid/",
    audience = "https://api.lovat.app";
  const verify = createJwtVerifier({
    issuer,
    audience,
    fetch: async (url, init) => {
      assert.equal(String(url), issuer + ".well-known/jwks.json");
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      fetches++;
      return Response.json({ keys: [jwk] });
    },
  });
  const token = (claims = {}, key = privateKey) =>
    new SignJWT({ sub: "synthetic-user" })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer(claims.issuer ?? issuer)
      .setAudience(claims.audience ?? audience)
      .setExpirationTime(claims.expires ?? "5m")
      .sign(key);
  const valid = await token();
  assert.equal((await verify(valid)).sub, "synthetic-user");
  assert.equal((await verify(valid)).sub, "synthetic-user");
  assert.equal(fetches, 1);
  for (const claims of [
    { issuer: "https://wrong.test.invalid/" },
    { audience: "wrong" },
    { expires: 0 },
  ])
    await assert.rejects(verify(await token(claims)));
  const wrong = await generateKeyPair("RS256");
  await assert.rejects(verify(await token({}, wrong.privateKey)));
  await assert.rejects(verify("malformed"));
  assert.equal(fetches, 1);
});
test("profile hydration checks subject and provider failures before any database write", async () => {
  let writes = 0;
  const db = {
    user: {
      upsert: async () => {
        writes++;
      },
    },
  };
  const provision = (body) =>
    createProvisioner(db, "https://auth.test.invalid/", async (url, init) => {
      assert.equal(String(url), "https://auth.test.invalid/userinfo");
      assert.equal(init.headers.Authorization, "Bearer synthetic");
      return Response.json(body);
    });
  await provision({
    sub: "subject",
    email: "fixture@example.invalid",
    email_verified: true,
  })("synthetic", "subject");
  assert.equal(writes, 1);
  await assert.rejects(
    provision({ sub: "another", email: "fixture@example.invalid" })(
      "synthetic",
      "subject",
    ),
    { code: "INVALID_IDENTITY" },
  );
  const unavailable = createProvisioner(
    db,
    "https://auth.test.invalid/",
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(unavailable("synthetic", "subject"), {
    code: "IDENTITY_UNAVAILABLE",
  });
  assert.equal(writes, 1);
});

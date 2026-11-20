import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServices } from "../dist/services/index.js";
import { createAnalysisCache } from "../dist/cache.js";
import { createIdentityService } from "../dist/identity.js";
import { createSignatureVerifier } from "../dist/signatures.js";
import { grade } from "../dist/domain/grading.js";
import { prediction, csv } from "../dist/domain/prediction.js";
import { createOfficialReader, rankingSchema } from "../dist/official.js";
const scope = {
  userId: "a",
  teamNumber: 1,
  role: "ANALYST",
  sources: {
    teams: { mode: "INCLUDE", items: [1] },
    tournaments: { mode: "EXCLUDE", items: [] },
  },
};
const request = {
  teams: [8033],
  metrics: ["totalPoints"],
  season: 2026,
  timeline: false,
};
const response = {
  season: 2026,
  teams: {
    8033: { metrics: { totalPoints: { value: 10, samples: 1, version: 1 } } },
  },
};
test("every inventoried legacy HTTP route has exactly one replacement", () => {
  const router = createServices({
    baseUrl: "http://example.invalid",
    commit: "test",
    analyze: async () => response,
  });
  const routes = JSON.parse(
    readFileSync(new URL("../legacy-routes.json", import.meta.url)),
  );
  for (const route of routes)
    assert.equal(
      router.endpoints.filter(
        (e) => e.method === route.method && e.path === route.path,
      ).length,
      1,
      route.method + " " + route.path,
    );
  assert.equal(router.endpoints.length, routes.length + 2);
});
test("cache shares concurrent calculations and isolates scopes and revisions", async () => {
  let computes = 0,
    revision = "0";
  const values = new Map();
  const store = {
    generations: async (teams) => teams.map(() => revision),
    get: async (key) => values.get(key) ?? null,
    set: async (key, value, ttl) => {
      assert.equal(ttl, 15);
      values.set(key, value);
    },
  };
  const cache = createAnalysisCache(store, () => "v1");
  const compute = async () => {
    computes++;
    await new Promise((r) => setTimeout(r, 5));
    return structuredClone(response);
  };
  const [a, b] = await Promise.all([
    cache(scope, request, compute),
    cache(scope, request, compute),
  ]);
  a.teams["8033"].metrics.totalPoints.value = 999;
  assert.equal(b.teams["8033"].metrics.totalPoints.value, 10);
  assert.equal(computes, 1);
  await cache(scope, request, compute);
  assert.equal(computes, 1);
  await cache(
    {
      ...scope,
      sources: { ...scope.sources, teams: { mode: "INCLUDE", items: [2] } },
    },
    request,
    compute,
  );
  assert.equal(computes, 2);
  revision = "1";
  await cache(scope, request, compute);
  assert.equal(computes, 3);
});
test("corrupt cache is repaired and Redis failure falls back to computation", async () => {
  let stored;
  const cache = createAnalysisCache(
    {
      generations: async () => ["0"],
      get: async () => "{",
      set: async (_k, v) => {
        stored = v;
      },
    },
    () => "v1",
  );
  assert.deepEqual(await cache(scope, request, async () => response), response);
  assert.deepEqual(JSON.parse(stored), response);
  const unavailable = createAnalysisCache(
    {
      generations: async () => {
        throw Error("offline");
      },
    },
    () => "v1",
  );
  assert.deepEqual(
    await unavailable(scope, request, async () => response),
    response,
  );
});
test("API keys use hashes and fresh ownership lookup for immediate revocation", async () => {
  const token = "lvt-" + "ab".repeat(32);
  let revoked = false,
    lookups = 0;
  const actor = {
    id: "a",
    teamNumber: 1,
    role: "ANALYST",
    teamSourceRule: { mode: "INCLUDE", items: [1] },
    tournamentSourceRule: { mode: "EXCLUDE", items: [] },
    team: { emailVerified: true },
  };
  const identity = createIdentityService(
    {
      apiKey: {
        findUnique: async (args) => {
          lookups++;
          assert.equal(
            args.where.keyHash,
            createHash("sha256").update(token).digest("hex"),
          );
          return revoked ? null : { user: actor };
        },
      },
    },
    {
      issuer: "https://identity.example/",
      audience: "test",
      verify: async () => {
        throw Error("JWT should not be used");
      },
      limiter: {
        consume: async (_key, limit, window) => {
          assert.equal(limit, 1);
          assert.equal(window, 3);
          return true;
        },
      },
    },
  );
  assert.equal((await identity("Bearer " + token)).tokenType, "apiKey");
  revoked = true;
  await assert.rejects(identity("Bearer " + token), (e) => e.status === 401);
  assert.equal(lookups, 2);
});
test("JWT accounts hydrate only once and rate limits fail closed", async () => {
  let actor = null,
    provisions = 0;
  const identity = createIdentityService(
    { user: { findUnique: async () => actor } },
    {
      issuer: "https://identity.example/",
      audience: "test",
      verify: async () => ({ sub: "a" }),
      provision: async () => {
        provisions++;
        actor = { id: "a" };
      },
      limiter: { consume: async () => true },
    },
  );
  await identity("Bearer jwt");
  await identity("Bearer jwt");
  assert.equal(provisions, 1);
  const limited = createIdentityService(
    { user: { findUnique: async () => actor } },
    {
      issuer: "https://identity.example/",
      audience: "test",
      verify: async () => ({ sub: "a" }),
      limiter: { consume: async () => false },
    },
  );
  await assert.rejects(limited("Bearer jwt"), (e) => e.status === 429);
});
test("Slack signature binds raw payload and rejects replay and mutation", async () => {
  const verify = createSignatureVerifier({ slackSecret: "test-secret" }),
    timestamp = String(Math.floor(Date.now() / 1000)),
    raw = "text=subscribe+break";
  const signature =
    "v0=" +
    createHmac("sha256", "test-secret")
      .update("v0:" + timestamp + ":" + raw)
      .digest("hex");
  const headers = {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  };
  assert.equal(
    await verify(headers, raw, true, "POST", "/v1/slack/command", {}),
    true,
  );
  assert.equal(
    await verify(headers, raw + "x", true, "POST", "/v1/slack/command", {}),
    false,
  );
  assert.equal(
    await verify(
      { ...headers, "x-slack-request-timestamp": "1" },
      raw,
      true,
      "POST",
      "/v1/slack/command",
      {},
    ),
    false,
  );
});
test("training grading penalizes duplicate and missing events and preserves exclusions", () => {
  const expected = {
    events: [
      { time: 10, action: "STOP_SCORING", position: "HUB", quantity: 100 },
    ],
    robotRoles: ["SCORING"],
    mobility: "NONE",
    autoClimb: "NOT_ATTEMPTED",
    endgameClimb: "L1",
    intakeType: "GROUND",
    beached: "NEITHER",
    scoresWhileMoving: false,
  };
  assert.equal(grade(expected, expected).overallScore, 100);
  const duplicate = {
    ...expected,
    events: [...expected.events, ...expected.events],
  };
  assert.ok(grade(duplicate, expected).overallScore < 100);
  assert.ok(grade({ ...expected, events: [] }, expected).overallScore < 50);
  assert.equal(
    grade({ ...expected, beached: "BOTH" }, expected, ["beached"]).overallScore,
    100,
  );
});
test("predictions handle deterministic ties and reject insufficient data", () => {
  assert.deepEqual(prediction(Array.from({ length: 6 }, () => [10, 10])), {
    redWinning: 0.5,
    blueWinning: 0.5,
    winningAlliance: 0,
  });
  assert.equal(
    prediction([
      [20, 20],
      [20, 20],
      [20, 20],
      [10, 10],
      [10, 10],
      [10, 10],
    ]).redWinning,
    1,
  );
  assert.throws(
    () => prediction(Array.from({ length: 6 }, () => [10])),
    (e) => e.status === 422,
  );
});
test("CSV escapes scouting notes and spreadsheet formulas", () => {
  const output = csv(
    [{ note: '=HYPERLINK("bad")', value: "a,b\nc" }],
    ["note", "value"],
  );
  assert.ok(output.includes("\"'=HYPERLINK("));
  assert.ok(output.includes("a,b\nc"));
});
test("official data is shared, cached and bounded to allowed event paths", async () => {
  let calls = 0;
  const official = createOfficialReader("test", async () => {
    calls++;
    return new Response(
      JSON.stringify({ rankings: [{ team_key: "frc8033", rank: 1 }] }),
    );
  });
  const results = await Promise.all([
    official("2026test", "rankings", rankingSchema),
    official("2026test", "rankings", rankingSchema),
  ]);
  assert.equal(results[0].rankings[0].rank, 1);
  assert.equal(calls, 1);
  await official("2026test", "rankings", rankingSchema);
  assert.equal(calls, 1);
  await assert.rejects(
    official("../other", "rankings", rankingSchema),
    (e) => e.status === 400,
  );
  await assert.rejects(
    official("2026test", "private", rankingSchema),
    (e) => e.status === 400,
  );
});

test("cold-analysis budget bounds parallel work, releases failures and expires queued work", async () => {
  const { createAnalysisBudget } = await import("../dist/budget.js");
  const budget = createAnalysisBudget(1, 1, 30);
  let finish;
  const first = budget(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  const queued = budget(async () => 2);
  await assert.rejects(
    budget(async () => 3),
    (e) => e.code === "ANALYSIS_BUSY",
  );
  await assert.rejects(queued, (e) => e.code === "ANALYSIS_BUSY");
  finish(1);
  assert.equal(await first, 1);
  await assert.rejects(
    budget(async () => {
      throw Error("calculation failed");
    }),
  );
  assert.equal(await budget(async () => 4), 4);
});

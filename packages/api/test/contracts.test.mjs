import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routes,
  reportSchema,
  eventTupleSchema,
  createApiClient,
  ApiClientError,
} from "../dist/index.js";

test("event wire numbering and quantity requirements stay compatible", () => {
  assert.equal(eventTupleSchema.safeParse([10, 1, 2]).success, false);
  assert.deepEqual(eventTupleSchema.parse([10, 1, 2, 0]), [10, 1, 2, 0]);
  assert.equal(eventTupleSchema.safeParse([10, 99, 2]).success, false);
  assert.equal(eventTupleSchema.safeParse([10, 0, 99]).success, false);
  assert.equal(eventTupleSchema.safeParse([10, 13, 2]).success, false);
  assert.equal(eventTupleSchema.safeParse([-1, 0, 2]).success, false);
});
test("analysis limits reject oversized and unknown inputs", () => {
  assert.equal(
    routes.analyze.input.safeParse({
      teams: [8033],
      metrics: ["totalPoints"],
      sourceTeam: 1,
    }).success,
    false,
  );
  assert.equal(
    routes.analyze.input.safeParse({
      teams: Array(101).fill(1),
      metrics: ["totalPoints"],
    }).success,
    false,
  );
  assert.equal(
    routes.analyze.input.parse({ teams: [8033], metrics: ["totalPoints"] })
      .timeline,
    false,
  );
});
test("client validates input before sending and parses structured failures", async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: "https://api.example",
    token: () => "secret",
    fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.example/v3/analysis");
      assert.equal(init.headers.Authorization, "Bearer secret");
      return new Response(
        JSON.stringify({
          code: "FORBIDDEN",
          message: "Denied",
          displayError: "Denied",
        }),
        { status: 403 },
      );
    },
  });
  await assert.rejects(client.request("analyze", { teams: [], metrics: [] }));
  assert.equal(calls, 0);
  await assert.rejects(
    client.request("analyze", { teams: [8033], metrics: ["totalPoints"] }),
    (error) =>
      error instanceof ApiClientError &&
      error.status === 403 &&
      error.details.code === "FORBIDDEN",
  );
});
test("client validates successful responses", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example",
    token: () => "secret",
    fetch: async () => new Response(JSON.stringify({ unexpected: true })),
  });
  await assert.rejects(
    client.request("analyze", { teams: [8033], metrics: ["totalPoints"] }),
  );
});
test("report definition has no database-owned scalar dependency", () => {
  assert.equal(
    reportSchema.shape.autoClimb.safeParse("SUCCEEDED").success,
    true,
  );
  assert.equal(
    reportSchema.shape.matchType.safeParse("PRACTICE").success,
    true,
  );
});

test("public discovery omits credentials and GET game selection uses query parameters", async () => {
  let credentials = 0;
  const client = createApiClient({
    baseUrl: "https://api.example",
    token: () => {
      credentials++;
      return "token";
    },
    fetch: async (url, init) => {
      if (url.pathname === "/v3/games") {
        assert.equal(init.headers.Authorization, undefined);
        return Response.json([]);
      }
      assert.equal(url.searchParams.get("season"), "2099");
      assert.equal(url.searchParams.get("gameVersion"), "2");
      assert.equal(init.body, undefined);
      assert.equal(init.headers.Authorization, "Bearer token");
      return Response.json([]);
    },
  });
  assert.deepEqual(await client.request("games", {}), []);
  assert.equal(credentials, 0);
  assert.deepEqual(
    await client.request("metrics", { season: 2099, gameVersion: 2 }),
    [],
  );
  assert.equal(credentials, 1);
});
test("generated OpenAPI references resolve and document Collection report authentication", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.$ref?.startsWith("#/")) {
      let target = document;
      for (const part of node.$ref.slice(2).split("/"))
        target = target?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
      assert.ok(target, "Unresolved schema: " + node.$ref);
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(document);
  const report = document.paths["/v3/reports"].post;
  assert.deepEqual(report.security, [{ collectionCode: [] }]);
  assert.ok(report.responses["201"]);
  assert.ok(
    report.parameters.some(
      (parameter) => parameter.name === "X-Scouter-Uuid" && parameter.required,
    ),
  );
});

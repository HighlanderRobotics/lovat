import assert from "node:assert/strict";
import { test } from "node:test";
import { createRailwayContext } from "railway/iac";
import config, { partial } from "./railway.ts";

for (const environment of ["production", "staging"]) {
  test(`${environment} retains deployment contracts`, () => {
    const graph = config(
      createRailwayContext({ environment, projectName: "lovat" }),
    );
    assert.equal(partial, "lovat-apps");
    assert.deepEqual(graph.resources.map((r) => r.name).sort(), [
      "api",
      "dashboard",
      "learn",
      "website",
      "worker",
    ]);
    const service = (name) => graph.resources.find((r) => r.name === name);
    for (const resource of graph.resources) {
      assert.equal(resource.build.builder, "DOCKERFILE");
      assert(resource.build.watchPatterns.includes("/.railway/**"));
      assert.notEqual(resource.deploy.sleepApplication, true);
      assert.equal(
        resource.deploy.restartPolicyType ?? "ON_FAILURE",
        "ON_FAILURE",
      );
      // Keep source connections and credential values during adoption.
      assert.equal(resource.source.repo, "HighlanderRobotics/lovat");
      assert.equal(
        resource.source.branch,
        environment === "production"
          ? "main"
          : "offseason/mock-game-charged-up",
      );
      assert(Object.keys(resource.variables).length > 0);
      for (const [name, value] of Object.entries(resource.variables)) {
        assert.deepEqual(
          value,
          resource.name === "worker" && name === "WORKER_MODE"
            ? { type: "literal", value: "continuous" }
            : { type: "preserve" },
        );
      }
    }
    const api = service("api");
    assert.equal(api.build.dockerfilePath, "apps/server/Dockerfile");
    assert(api.build.watchPatterns.includes("/packages/db/**"));
    assert(api.deploy.startCommand.includes("db:deploy && exec npm start"));
    assert(api.deploy.startCommand.includes("$DATABASE_PRIVATE_URL"));
    assert.equal(api.deploy.healthcheckPath, "/status");
    assert.deepEqual(
      api.deploy.limitOverride,
      environment === "staging"
        ? { containers: { cpu: 2, memoryBytes: 2147483648 } }
        : undefined,
    );
    const worker = service("worker");
    assert.equal(worker.deploy.healthcheckPath, "/health");
    assert.equal(worker.deploy.drainingSeconds, 60);
    assert.equal(worker.deploy.startCommand, "bun index.ts");
    assert.deepEqual(worker.deploy.multiRegionConfig, {
      "us-west2": { numReplicas: 1 },
    });
    for (const name of ["dashboard", "learn", "website"]) {
      assert.equal(service(name).deploy.healthcheckPath, "/healthz");
    }
  });
}

test("refuses missing environment context rather than dropping staging limits", () => {
  for (const environment of [undefined, "", "   "]) {
    assert.throws(
      () => config(createRailwayContext({ environment })),
      /environment context is required/,
    );
  }
});

test("refuses preview plans without an explicit source branch", () => {
  const previous = process.env.RAILWAY_CONFIG_BRANCH;
  delete process.env.RAILWAY_CONFIG_BRANCH;
  try {
    assert.throws(
      () => config(createRailwayContext({ environment: "lovat-pr-115" })),
      /RAILWAY_CONFIG_BRANCH/,
    );
    process.env.RAILWAY_CONFIG_BRANCH = "example/preview";
    const graph = config(createRailwayContext({ environment: "lovat-pr-115" }));
    for (const service of graph.resources)
      assert.equal(service.source.branch, "example/preview");
  } finally {
    if (previous === undefined) delete process.env.RAILWAY_CONFIG_BRANCH;
    else process.env.RAILWAY_CONFIG_BRANCH = previous;
  }
});

test("offseason cron uses a finite batch without a health listener or restarts", () => {
  const previous = process.env.RAILWAY_WORKER_CRON;
  process.env.RAILWAY_WORKER_CRON = "0 18 * * *";
  try {
    const graph = config(createRailwayContext({ environment: "production" }));
    const worker = graph.resources.find((r) => r.name === "worker");
    assert.deepEqual(worker.variables.WORKER_MODE, {
      type: "literal",
      value: "batch",
    });
    assert.equal(worker.deploy.cronSchedule, "0 18 * * *");
    assert.equal(worker.deploy.restartPolicyType, "NEVER");
    assert.equal(worker.deploy.healthcheckPath, undefined);
  } finally {
    if (previous === undefined) delete process.env.RAILWAY_WORKER_CRON;
    else process.env.RAILWAY_WORKER_CRON = previous;
  }
  const worker = config(
    createRailwayContext({ environment: "production" }),
  ).resources.find((r) => r.name === "worker");
  assert.equal(worker.deploy.cronSchedule, undefined);
  assert.equal(worker.deploy.healthcheckPath, "/health");
});

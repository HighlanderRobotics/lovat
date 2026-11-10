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
      assert.equal(resource.deploy.sleepApplication, false);
      // Provider-managed sources, secrets and storage must not be replaced.
      assert.equal(resource.source, undefined);
      assert.equal(resource.variables, undefined);
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

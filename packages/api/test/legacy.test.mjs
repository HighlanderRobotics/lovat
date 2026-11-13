import { test } from "node:test";
import assert from "node:assert/strict";
import { createLegacyOpenApiDocument } from "../dist/legacy/index.js";
test("legacy definitions build without database, server imports or environment configuration", () => {
  const document = createLegacyOpenApiDocument({
    version: "test",
    baseUrl: "https://api.example",
  });
  assert.equal(Object.keys(document.paths).length, 77);
  assert.equal(document.info.version, "test");
  assert(document.paths["/v1/manager/scoutreports/{uuid}"].get);
  assert(document.paths["/v1/analysis/matchprediction"].get);
  assert(document.components.schemas.ScoutReport);
  assert.equal(
    document.components.schemas.ApiKey.properties.keyHash,
    undefined,
  );
});
test("documents are isolated and errors keep their shared public contract", () => {
  const options = { version: "test", baseUrl: "https://api.example" };
  const first = createLegacyOpenApiDocument(options);
  delete first.paths["/v1/manager/profile"];
  const second = createLegacyOpenApiDocument(options);
  assert(second.paths["/v1/manager/profile"]);
  assert.equal(
    second.paths["/v1/manager/profile"].get.responses[401].content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/ApiError",
  );
});

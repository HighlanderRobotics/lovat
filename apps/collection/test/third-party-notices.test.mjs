import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("offline font notices match their canonical texts byte for byte", async () => {
  const directory = new URL("../assets/fonts/", import.meta.url);
  const notices = JSON.parse(
    await readFile(new URL("third-party-notices.json", directory), "utf8"),
  );
  for (const [key, filename] of [
    ["heebo", "Heebo-OFL.txt"],
    ["materialSymbols", "Material-Symbols-Apache-2.0.txt"],
  ]) {
    assert.deepEqual(
      Buffer.from(notices[key]),
      await readFile(new URL(filename, directory)),
      "Regenerate with node scripts/generate-third-party-notices.mjs",
    );
  }
});

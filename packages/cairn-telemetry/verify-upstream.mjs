import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, "UPSTREAM.json"), "utf8"),
);
for (const [upstream, expected] of Object.entries(manifest.sha256)) {
  const path = resolve(root, "src", upstream.replace(/^packages\//, ""));
  if (!path.startsWith(resolve(root, "src") + sep))
    throw new Error("Invalid upstream path");
  const actual = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (actual !== expected)
    throw new Error(`Upstream source checksum mismatch: ${upstream}`);
}
console.log(
  `Verified ${Object.keys(manifest.sha256).length} SDK sources from Cairn ${manifest.commit}`,
);

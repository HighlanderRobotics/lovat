import { stripVTControlCharacters } from "node:util";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("test-report", { recursive: true });
async function run(command, args) {
  let output = "";
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  return { code, output };
}
const legacy = await run("npm", ["run", "test:legacy"]);
const unit = await run(process.execPath, [
  "node_modules/jest/bin/jest.js",
  "--runInBand",
  "--coverage",
  "--json",
  "--outputFile=test-report/jest.json",
]);
let results = {};
try {
  results = JSON.parse(await readFile("test-report/jest.json", "utf8"));
} catch {
  /* Report startup failures too. */
}
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const output = escape(
  stripVTControlCharacters(legacy.output + "\n" + unit.output),
);
await writeFile(
  "test-report/index.html",
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Collection test report</title><style>body{font:16px system-ui;margin:2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:1rem}a{color:#350868}</style></head><body><h1>Collection test report</h1><p>Legacy checks: ${legacy.code === 0 ? "passed" : "failed"}. Jest: ${results.numPassedTests ?? 0} passed, ${results.numFailedTests ?? 0} failed.</p><nav><a href="coverage/">Coverage</a> · <a href="junit.xml">JUnit XML</a> · <a href="../">All apps</a></nav><pre>${output}</pre></body></html>`,
);
process.exitCode = legacy.code || unit.code;

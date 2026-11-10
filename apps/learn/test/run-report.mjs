import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";

await mkdir("test-report", { recursive: true });
const files = (await readdir("test"))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => `test/${file}`);
const child = spawn(
  process.execPath,
  [
    "--experimental-test-coverage",
    "--test",
    "--test-coverage-include=plugins/*.mjs",
    "--test-coverage-lines=100",
    "--test-coverage-branches=100",
    "--test-coverage-functions=100",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=junit",
    "--test-reporter-destination=test-report/unit.xml",
    ...files,
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
let output = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
const code = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (status) => resolve(status ?? 1));
});
const escaped = output
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
await writeFile(
  "test-report/index.html",
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Learn test report</title>
<style>body{font:16px system-ui;margin:2rem;max-width:75rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:1rem}a{color:#350868}</style></head>
<body><h1>Learn test report</h1><p>Unit tests and link-plugin coverage: <strong>${code === 0 ? "passed" : "failed"}</strong>.</p>
<nav><a href="unit.xml">JUnit results</a> · <a href="browser/">Browser tests</a> · <a href="../">All app reports</a></nav><pre>${escaped}</pre></body></html>`,
);
process.exitCode = code;

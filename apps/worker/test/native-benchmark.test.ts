import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import template from "../config/scoreboard-2026-calgames.json";

test("native benchmark preserves evidence, authenticates and reverses repeated case order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lovat-native-benchmark-"));
  const labels: string[] = [];
  let runtimeDrift = false;
  const token = "test-token-" + "x".repeat(32);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(request.headers.get("Authorization")).toBe(`Bearer ${token}`);
      const form = await request.formData();
      labels.push(JSON.parse(String(form.get("metadata"))).expectedMatchLabel);
      return Response.json({
        observations: [{ time: 0, red: 0, blue: 0, confidence: 95 }],
        channels: { red: [{ time: 0, count: 0, confidence: 95 }], blue: [] },
        layoutVersion: template.version,
        elapsedMs: 1,
        frames: 1,
        ...(runtimeDrift
          ? {
              runtime: {
                tesseractVersion: "5.5.1",
                language: "eng",
                modelSha256: (labels.length % 2 ? "a" : "b").repeat(64),
              },
            }
          : {}),
      });
    },
  });
  try {
    const video = join(dir, "public-fixture.mp4");
    await writeFile(video, "synthetic fixture bytes");
    await writeFile(
      join(dir, "cases.json"),
      JSON.stringify(
        [1, 2].map((q) => ({
          matchKey: `2026test_qm${q}`,
          video,
          expectedTeams: [1, 2, 3, 4, 5, 6],
          expectedMatchLabel: `Qualification ${q}`,
        })),
      ),
    );
    const run = async (output = "results") => {
      const child = Bun.spawn(
        [
          process.execPath,
          "tools/benchmark-native.ts",
          "--cases",
          join(dir, "cases.json"),
          "--template",
          "config/scoreboard-2026-calgames.json",
          "--output",
          join(dir, output),
          "--label",
          "test",
          "--rounds",
          "2",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          env: {
            ...process.env,
            OCR_SERVICE_URL: `http://127.0.0.1:${server.port}`,
            OCR_SERVICE_TOKEN: token,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, stdout, stderr };
    };
    const result = await run();
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(labels).toEqual([
      "Qualification 1",
      "Qualification 2",
      "Qualification 2",
      "Qualification 1",
    ]);
    const summary = JSON.parse(
      await readFile(join(dir, "results", "summary.json"), "utf8"),
    );
    expect(summary.runs).toBe(4);
    expect(new Set(summary.records.map((r: any) => r.mediaSha256)).size).toBe(
      1,
    );
    expect(
      new Set(summary.records.map((r: any) => r.observationSha256)).size,
    ).toBe(1);
    const timings = summary.records
      .map((r: any) => r.elapsedMs)
      .sort((a: number, b: number) => a - b);
    expect(summary.medianMs).toBe((timings[1] + timings[2]) / 2);
    expect((await run()).stderr).toContain("must be empty");
    runtimeDrift = true;
    expect((await run("mixed-runtime")).stderr).toContain(
      "runtime identity changed",
    );
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

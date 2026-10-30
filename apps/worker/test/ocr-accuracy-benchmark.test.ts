import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fuseMatch } from "../src/ocr/fusion";
import { evaluateAccuracy } from "../src/ocr/accuracy-benchmark";
import { fuseTimingCandidate } from "../src/ocr/timing-experiment";
import { contributionTables } from "../src/ocr/contribution-export";
import { fixture } from "./fixtures/official-fusion";

const reference = () => ({
  matchKey: "2026test_qm1",
  evidence: "Synthetic independently counted example",
  notes: [],
  robotCounts: [
    {
      teamNumber: 1,
      alliance: "RED",
      phase: "AUTO",
      minimum: 4,
      maximum: 4,
      basis: "ROBOT_ONLY",
    },
  ],
  humanPlayerMinimums: [],
});
const baseline = () => fuseTimingCandidate(fixture(), [8033], 0);

test("exact robot counts yield signed error and MAE only for labeled phases", () => {
  const ref = reference();
  ref.robotCounts[0]!.minimum = ref.robotCounts[0]!.maximum = 3;
  const result = evaluateAccuracy(baseline(), ref);
  expect(result.summary[0]).toMatchObject({
    exactLabels: 1,
    exactSubsetMeanAbsoluteError: 1,
    exactSubsetSignedBias: 1,
    minimumAbsoluteError: 1,
  });
  expect(result.summary[1]).toMatchObject({
    labels: 0,
    exactSubsetMeanAbsoluteError: null,
  });
  expect(result.rows[0]!.verdict).toBe("ABOVE_BOUND");
});

test("HP-inclusive bounds never become exact accuracy metrics", () => {
  const ref = reference();
  ref.robotCounts[0] = {
    ...ref.robotCounts[0]!,
    minimum: 0,
    maximum: 3,
    basis: "UPPER_BOUND_INCLUDES_HP",
  };
  const result = evaluateAccuracy(baseline(), ref);
  expect(result.rows[0]).toMatchObject({
    exact: false,
    minimumAbsoluteError: 1,
    maximumAbsoluteError: 4,
    signedError: null,
  });
  expect(result.summary[0]!.exactSubsetMeanAbsoluteError).toBeNull();
  ref.robotCounts[0]!.maximum = 4;
  expect(evaluateAccuracy(baseline(), ref).rows[0]!.verdict).toBe(
    "WITHIN_BOUND_NOT_VALIDATED",
  );
  ref.robotCounts[0]!.minimum = 1;
  expect(() => evaluateAccuracy(baseline(), ref)).toThrow("upper bound only");
});

test("zero-only exact labels are explicitly identified", () => {
  const ref = reference();
  ref.robotCounts[0] = {
    ...ref.robotCounts[0]!,
    teamNumber: 3,
    minimum: 0,
    maximum: 0,
  };
  expect(evaluateAccuracy(baseline(), ref).summary[0]).toMatchObject({
    exactSubsetAllZero: true,
    exactSubsetMeanAbsoluteError: 0,
  });
});

test("human-player minima bound robot overcredit without assigning HP to a robot", () => {
  const ref = {
    ...reference(),
    robotCounts: [
      {
        ...reference().robotCounts[0]!,
        minimum: 0,
        maximum: 4,
        basis: "UPPER_BOUND_INCLUDES_HP",
      },
    ],
    humanPlayerMinimums: [{ alliance: "RED", phase: "TOTAL", fuel: 3 }],
  };
  expect(evaluateAccuracy(baseline(), ref).humanPlayerChecks[0]).toMatchObject({
    officialFuel: 10,
    estimatedRobotFuel: 8,
    maximumRobotFuel: 7,
    minimumRobotOvercredit: 1,
  });
  ref.humanPlayerMinimums[0]!.fuel = 11;
  expect(() => evaluateAccuracy(baseline(), ref)).toThrow("exceeds budget");
  ref.humanPlayerMinimums[0] = { alliance: "RED", phase: "AUTO", fuel: 1 };
  ref.robotCounts[0]!.minimum = 4;
  ref.robotCounts[0]!.basis = "ROBOT_ONLY";
  expect(() => evaluateAccuracy(baseline(), ref)).toThrow(
    "minima exceed budget",
  );
});

test("references reject wrong identities, duplicates and impossible bounds", () => {
  const ref = reference();
  expect(() =>
    evaluateAccuracy(baseline(), { ...ref, matchKey: "other" }),
  ).toThrow("identity");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [...ref.robotCounts, ...ref.robotCounts],
    }),
  ).toThrow("Duplicate");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [{ ...ref.robotCounts[0], alliance: "BLUE" }],
    }),
  ).toThrow("roster");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [{ ...ref.robotCounts[0], maximum: 5 }],
    }),
  ).toThrow("exceeds official");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [{ ...ref.robotCounts[0], minimum: 5 }],
    }),
  ).toThrow("Reversed");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      humanPlayerMinimums: [
        { alliance: "RED", phase: "TOTAL", fuel: 0 },
        { alliance: "RED", phase: "TOTAL", fuel: 0 },
      ],
    }),
  ).toThrow("Duplicate human");
});

test("rejects collectively impossible references rather than scoring misleading labels", () => {
  const ref = reference();
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [
        ...ref.robotCounts,
        { ...ref.robotCounts[0], teamNumber: 2, minimum: 1, maximum: 1 },
      ],
    }),
  ).toThrow("minima exceed alliance");
  expect(() =>
    evaluateAccuracy(baseline(), {
      ...ref,
      robotCounts: [
        ...ref.robotCounts,
        { ...ref.robotCounts[0], phase: "TOTAL", minimum: 0, maximum: 3 },
      ],
    }),
  ).toThrow("contradict each other");
});

test("zero offset preserves baseline and experiments never mutate production inputs", () => {
  const input = fixture(),
    original = JSON.stringify(input);
  const before = fuseMatch(input, [8033]);
  if (!("officialResultAvailable" in before))
    throw new Error("Expected official fixture");
  const zero = fuseTimingCandidate(input, [8033], 0);
  expect(zero.alliances).toEqual(before.alliances);
  expect(zero.algorithm).toContain("experiment");
  expect(zero.semanticInputSha256).not.toBe(before.semanticInputSha256);
  for (const offset of [-3000, 3000]) {
    const r = fuseTimingCandidate(input, [8033], offset);
    expect(r.alliances.map((a) => a.attributionEvidence)).toEqual(
      before.alliances.map((a) => a.attributionEvidence),
    );
    contributionTables([r]);
  }
  expect(JSON.stringify(input)).toBe(original);
  expect(fuseMatch(input, [8033])).toEqual(before);
  for (const offset of [3001, -3001, 1.1, NaN, Infinity])
    expect(() => fuseTimingCandidate(input, [8033], offset)).toThrow("±3000");
  const { tba, ...noTba } = input;
  expect(() => fuseTimingCandidate(noTba, [8033], 0)).toThrow("requires TBA");
});

test("bounded timing shifts expose allocation sensitivity rather than inventing evidence", () => {
  const input = fixture();
  const b = input.tba.score_breakdown.red;
  b.hubScore = {
    ...b.hubScore,
    autoCount: 0,
    autoPoints: 0,
    teleopCount: 12,
    teleopPoints: 12,
    totalCount: 12,
    totalPoints: 12,
    endgameCount: 12,
    endgamePoints: 12,
  };
  Object.assign(b, {
    totalAutoPoints: 0,
    totalTeleopPoints: 12,
    totalPoints: 12,
    foulPoints: 0,
  });
  input.tba.alliances.red.score = 12;
  input.reports[0]!.events[0]!.time = 30;
  input.reports[0]!.events[1]!.time = 32;
  input.reports[1]!.events[0]!.time = 37;
  input.reports[1]!.events[1]!.time = 39;
  input.ocr.observations = [
    [0, 0],
    [20, 0],
    [23, 0],
    [30, 0],
    [31, 6],
    [32, 6],
    [36, 6],
    [37, 12],
    [38, 12],
    [163, 12],
  ].map(([time, red]) => ({ time: time!, red: red!, blue: 0, confidence: 95 }));
  const unshifted = fuseTimingCandidate(input, [8033], 0),
    shifted = fuseTimingCandidate(input, [8033], 3000);
  expect(shifted.alliances[0]!.unattributedFuel).toBeGreaterThan(
    unshifted.alliances[0]!.unattributedFuel,
  );
  expect(
    shifted.alliances[0]!.intervals.map((i) => i.observedFuelDelta),
  ).toEqual(unshifted.alliances[0]!.intervals.map((i) => i.observedFuelDelta));
  expect(shifted.alliances[0]!.attributionEvidence).toEqual(
    unshifted.alliances[0]!.attributionEvidence,
  );
  contributionTables([shifted]);
});

test("benchmark CLI exports deterministic comparisons and refuses overwrite/wrong counts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lovat-fusion-benchmark-"));
  try {
    await mkdir(join(dir, "inputs"));
    await mkdir(join(dir, "refs"));
    await writeFile(
      join(dir, "inputs", "match.json"),
      JSON.stringify(fixture()),
    );
    await writeFile(
      join(dir, "refs", "reference.json"),
      JSON.stringify(reference()),
    );
    const run = async (out: string, expected = "1") => {
      const child = Bun.spawn(
        [
          process.execPath,
          "tools/benchmark-fusion.ts",
          "--input",
          join(dir, "inputs"),
          "--references",
          join(dir, "refs"),
          "--output",
          join(dir, out),
          "--source-teams",
          "8033",
          "--expected-matches",
          expected,
        ],
        { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, stdout, stderr };
    };
    const first = await run("a");
    expect(first.stderr).toBe("");
    expect(first.code).toBe(0);
    expect((await run("b")).code).toBe(0);
    expect(await readFile(join(dir, "a", "benchmark.json"), "utf8")).toBe(
      await readFile(join(dir, "b", "benchmark.json"), "utf8"),
    );
    expect((await run("a")).stderr).toContain("must be empty");
    expect((await run("wrong-count", "2")).stderr).toContain(
      "Unexpected benchmark match count",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

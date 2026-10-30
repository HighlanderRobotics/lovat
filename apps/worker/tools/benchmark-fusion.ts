import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fuseMatch } from "../src/ocr/fusion";
import {
  evaluateAccuracy,
  referenceSchema,
} from "../src/ocr/accuracy-benchmark";
import { fuseTimingCandidate } from "../src/ocr/timing-experiment";
import {
  contributionCsv,
  contributionTables,
} from "../src/ocr/contribution-export";

const args = Bun.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const inputPath = args.includes("--input") ? option("--input") : undefined;
const referencePath = args.includes("--references")
  ? option("--references")
  : undefined;
const outputPath = args.includes("--output") ? option("--output") : undefined;
const sources = [
  ...new Set(
    (args.includes("--source-teams") ? (option("--source-teams") ?? "") : "")
      .split(",")
      .map(Number),
  ),
].sort((a, b) => a - b);
if (
  !inputPath ||
  !referencePath ||
  !outputPath ||
  !sources.length ||
  sources.some((n) => !Number.isSafeInteger(n) || n <= 0)
)
  throw new Error(
    "Use --input DIR --references DIR --output EMPTY_DIR --source-teams 1967,8033 [--expected-matches 37]",
  );
const output = resolve(outputPath);
if ([inputPath, referencePath].some((p) => resolve(p) === output))
  throw new Error("Keep benchmark outputs separate from inputs and references");
await mkdir(output, { recursive: true, mode: 0o700 });
if ((await readdir(output)).length)
  throw new Error("Benchmark output directory must be empty");
const expected = args.includes("--expected-matches")
  ? option("--expected-matches")
  : undefined;
if (expected !== undefined && (!/^\d+$/.test(expected) || Number(expected) < 1))
  throw new Error("Invalid expected match count");
const refs = new Map<string, ReturnType<typeof referenceSchema.parse>>();
for (const file of (await readdir(referencePath))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const ref = referenceSchema.parse(
    JSON.parse(await readFile(join(referencePath, file), "utf8")),
  );
  if (refs.has(ref.matchKey)) throw new Error("Duplicate reference match");
  refs.set(ref.matchKey, ref);
}
if (!refs.size) throw new Error("At least one manual reference required");
const seen = new Set<string>();
type Accuracy = ReturnType<typeof evaluateAccuracy>;
type Candidate = {
  offsetMs: number;
  semanticInputSha256: string;
  changedRobots: number;
  absoluteRobotPhaseChange: number;
  unattributedFuel: number;
  accuracy: Accuracy | null;
  teamFuel: {
    teamNumber: number;
    alliance: string;
    auto: number;
    teleop: number;
    total: number;
  }[];
};
const matches: {
  matchKey: string;
  baselineAlgorithm: string;
  baselineInputSha256: string;
  baselineAccuracy: Accuracy | null;
  candidates: Candidate[];
}[] = [];
const evaluationRows: Record<string, string | number>[] = [];
const constraintRows: Record<string, string | number>[] = [];
const sensitivityRows: Record<string, string | number>[] = [];
const robustnessRows: Record<string, string | number>[] = [];
// Predeclared symmetric sweep. Do not select a winner from lower unknown fuel
// or from the one partially labeled match; no candidate is promoted here.
const offsets = [-3000, -2000, -1000, 0, 1000, 2000, 3000];
for (const file of (await readdir(inputPath))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const record = JSON.parse(await readFile(join(inputPath, file), "utf8"));
  const input = record.fusionInput ?? record;
  const baseline = fuseMatch(input, sources);
  if (!("officialResultAvailable" in baseline))
    throw new Error("Benchmark requires official TBA budgets");
  if (seen.has(baseline.matchKey)) throw new Error("Duplicate input match");
  seen.add(baseline.matchKey);
  const baselineTables = contributionTables([baseline]);
  const reference = refs.get(baseline.matchKey);
  const baselineAccuracy = reference
    ? evaluateAccuracy(baseline, reference)
    : null;
  const candidates = offsets.map((offsetMs) => {
    const candidate = fuseTimingCandidate(input, sources, offsetMs);
    const tables = contributionTables([candidate]);
    // Verify permutation invariance of the experiment itself, not just baseline.
    const permuted = {
      ...input,
      slots: [...input.slots].reverse(),
      reports: [...input.reports]
        .reverse()
        .map((r: any) => ({ ...r, events: [...r.events].reverse() })),
      ocr: {
        ...input.ocr,
        observations: [...input.ocr.observations].reverse(),
        ...(input.ocr.channels
          ? {
              channels: {
                red: [...input.ocr.channels.red].reverse(),
                blue: [...input.ocr.channels.blue].reverse(),
              },
            }
          : {}),
      },
    };
    if (
      JSON.stringify(candidate) !==
      JSON.stringify(fuseTimingCandidate(permuted, sources, offsetMs))
    )
      throw new Error(
        "Timing candidate is not deterministic after permutation",
      );
    if (
      offsetMs === 0 &&
      JSON.stringify(tables.teams.map(({ algorithm, ...t }) => t)) !==
        JSON.stringify(baselineTables.teams.map(({ algorithm, ...t }) => t))
    )
      throw new Error("Zero-offset candidate changed baseline allocations");
    const accuracy = reference ? evaluateAccuracy(candidate, reference) : null;
    if (accuracy) {
      for (const row of accuracy.rows)
        evaluationRows.push({
          matchKey: candidate.matchKey,
          offsetMs,
          ...row,
          exact: Number(row.exact),
          signedError: row.signedError ?? "",
        });
      for (const row of accuracy.humanPlayerChecks)
        constraintRows.push({ matchKey: candidate.matchKey, offsetMs, ...row });
    }
    let phaseFuelMovement = 0;
    let changedRobots = 0;
    let unknownFuel = 0;
    for (const a of candidate.alliances) {
      const before = baseline.alliances.find((b) => b.alliance === a.alliance)!;
      unknownFuel += a.unattributedFuel;
      let allianceMovement = 0;
      for (const robot of a.teams) {
        const old = before.teams.find(
          (t) => t.teamNumber === robot.teamNumber,
        )!;
        const movement =
          Math.abs(robot.autoFuelCount - old.autoFuelCount) +
          Math.abs(robot.teleopFuelCount - old.teleopFuelCount);
        if (movement) changedRobots++;
        phaseFuelMovement += movement;
        allianceMovement += movement;
      }
      sensitivityRows.push({
        matchKey: candidate.matchKey,
        offsetMs,
        alliance: a.alliance,
        officialFuel: a.officialFuel,
        unattributedFuel: a.unattributedFuel,
        changeInUnattributedFuel: a.unattributedFuel - before.unattributedFuel,
        absoluteRobotPhaseChange: allianceMovement,
      });
    }
    return {
      offsetMs,
      semanticInputSha256: candidate.semanticInputSha256,
      changedRobots,
      absoluteRobotPhaseChange: phaseFuelMovement,
      unattributedFuel: unknownFuel,
      accuracy,
      teamFuel: candidate.alliances.flatMap((a) =>
        a.teams.map((t) => ({
          teamNumber: t.teamNumber,
          alliance: a.alliance,
          auto: t.autoFuelCount,
          teleop: t.teleopFuelCount,
          total: t.estimatedFuel,
        })),
      ),
    };
  });
  for (const alliance of baseline.alliances) {
    for (const robot of alliance.teams) {
      const variants = candidates.map((c) =>
        c.teamFuel.find((t) => t.teamNumber === robot.teamNumber)!,
      );
      robustnessRows.push({
        matchKey: baseline.matchKey,
        alliance: alliance.alliance,
        teamNumber: robot.teamNumber,
        baselineAuto: robot.autoFuelCount,
        autoMinimum: Math.min(...variants.map((t) => t.auto)),
        autoMaximum: Math.max(...variants.map((t) => t.auto)),
        baselineTeleop: robot.teleopFuelCount,
        teleopMinimum: Math.min(...variants.map((t) => t.teleop)),
        teleopMaximum: Math.max(...variants.map((t) => t.teleop)),
        baselineTotal: robot.estimatedFuel,
        totalMinimum: Math.min(...variants.map((t) => t.total)),
        totalMaximum: Math.max(...variants.map((t) => t.total)),
        changedCandidates: variants.filter(
          (t) =>
            t.auto !== robot.autoFuelCount ||
            t.teleop !== robot.teleopFuelCount,
        ).length,
      });
    }
  }
  matches.push({
    matchKey: baseline.matchKey,
    baselineAlgorithm: baseline.algorithm,
    baselineInputSha256: baseline.semanticInputSha256,
    baselineAccuracy,
    candidates,
  });
}
if (expected !== undefined && matches.length !== Number(expected))
  throw new Error("Unexpected benchmark match count");
for (const key of refs.keys())
  if (!seen.has(key)) throw new Error("Reference has no matching input");
matches.sort((a, b) =>
  a.matchKey.localeCompare(b.matchKey, undefined, { numeric: true }),
);
const summary = offsets.map((offsetMs) => {
  const candidates = matches.map((m) =>
    m.candidates.find((c) => c.offsetMs === offsetMs)!,
  );
  return {
    offsetMs,
    matches: candidates.length,
    changedRobots: candidates.reduce((n, c) => n + c.changedRobots, 0),
    absoluteRobotPhaseChange: candidates.reduce(
      (n, c) => n + c.absoluteRobotPhaseChange,
      0,
    ),
    unattributedFuel: candidates.reduce((n, c) => n + c.unattributedFuel, 0),
    labeledMatches: candidates.filter((c) => c.accuracy).length,
  };
});
const report = {
  benchmark: "fusion-accuracy-and-timing-sensitivity-v1",
  sourceTeams: sources,
  matches: matches.length,
  references: refs.size,
  productionPolicyChanged: false,
  offsetsMs: offsets,
  summary,
  results: matches,
  limitations: [
    "A timing sweep measures sensitivity, not accuracy on unlabeled matches.",
    "Candidates keep original phase votes and official phase budgets; only attribution windows move.",
    "Positive offsets move the report attribution window later on the OCR timeline; this cannot distinguish scout lag from scoreboard lag.",
    "No candidate is selected or deployed from fewer unknown counts or a partially labeled calibration match.",
    "Timing robustness ranges cover this fixed ±3-second sweep only; they are not statistical confidence intervals or bounds on actual robot fuel.",
  ],
};
const contents = {
  "benchmark.json": JSON.stringify(report, null, 2) + "\n",
  "robot-reference-comparison.csv": contributionCsv(evaluationRows),
  "human-player-constraints.csv": contributionCsv(constraintRows),
  "timing-sensitivity.csv": contributionCsv(sensitivityRows),
  "timing-robustness.csv": contributionCsv(robustnessRows),
};
for (const [name, text] of Object.entries(contents))
  await writeFile(join(output, name), text, { mode: 0o600 });
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(
    {
      benchmark: report.benchmark,
      sourceTeams: sources,
      matches: matches.length,
      references: refs.size,
      files: Object.fromEntries(
        Object.entries(contents).map(([name, text]) => [
          name,
          createHash("sha256").update(text).digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    { output, matches: matches.length, references: refs.size, summary },
    null,
    2,
  ),
);

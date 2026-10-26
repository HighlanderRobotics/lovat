import { createTbaClient, tbaMatchSchema } from "../src/providers/tba";
import { parseArgs } from "node:util";
import { fuseMatch } from "../src/ocr/fusion";
import {
  extractScoreboard,
  OcrTimelineError,
  templateSchema,
} from "../src/ocr/media";
import { validateEvidence, validateObservations } from "../src/ocr/evidence";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: true,
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "source-teams": { type: "string" },
    template: { type: "string" },
    video: { type: "string" },
    enriched: { type: "string" },
    "match-label": { type: "string" },
    "tba-file": { type: "string" },
    "fetch-tba": { type: "boolean" },
  },
});
if (!values.input || !values.output || !values["source-teams"])
  throw new Error(
    "Usage: bun tools/estimate-match.ts --input logs.json --output estimate.json --source-teams 1967,8033 [--template config/scoreboard-2026-calgames.json] [--video /tmp/match.mp4] [--enriched /tmp/with-points.json] [--tba-file match.json | --fetch-tba]",
  );
const sourceTeams = values["source-teams"].split(",").map(Number);
const input = await Bun.file(values.input).json();
if (!Array.isArray(input.ocr?.observations))
  throw new Error("Input needs the exported match OCR and scouting logs");
if (values["tba-file"] && values["fetch-tba"])
  throw new Error("Choose --tba-file or --fetch-tba");
if (values["tba-file"]) input.tba = await Bun.file(values["tba-file"]).json();
if (values["fetch-tba"]) {
  if (!/^2026[a-z0-9]+_(?:qm\d+|(?:ef|qf|sf|f)\d+m\d+)$/.test(input.matchKey))
    throw new Error("Invalid TBA match key");
  const apiKey = process.env.TBA_KEY;
  if (!apiKey) throw new Error("Set TBA_KEY to use --fetch-tba");
  const response = await createTbaClient({ apiKey }).get(
    `match/${input.matchKey}`,
    tbaMatchSchema,
  );
  if (!response.modified) throw new Error("No TBA result available");
  input.tba = response.data;
}
const hasPoints = input.ocr.observations.some(
  (s: any) =>
    s.redPoints !== undefined &&
    s.bluePoints !== undefined &&
    (s.pointsConfidence ?? 0) >= 85,
);
if (!hasPoints && input.tba === undefined) {
  if (!values.template)
    throw new Error(
      "Existing OCR has no total-score digits: supply --template to extract them automatically",
    );
  const profile = templateSchema.parse(await Bun.file(values.template).json());
  const label =
    values["match-label"] ??
    (/^2026[a-z0-9]+_qm(\d+)$/.exec(input.matchKey)?.[1]
      ? `Qualification ${/^2026[a-z0-9]+_qm(\d+)$/.exec(input.matchKey)![1]}`
      : undefined);
  if (!label)
    throw new Error("Supply --match-label for non-qualification videos");
  let observations;
  try {
    observations = await extractScoreboard(
      input.ocr.videoKey,
      input.slots.map((s: any) => s.teamNumber),
      label,
      profile,
      { localVideo: values.video },
    );
  } catch (error) {
    if (error instanceof OcrTimelineError) observations = error.observations;
    else throw error;
  }
  input.ocr = {
    matchKey: input.matchKey,
    videoKey: input.ocr.videoKey,
    observations,
    templateVersion: profile.version,
    status: validateObservations(observations)
      ? "VALIDATED"
      : validateEvidence(observations)
        ? "PARTIAL"
        : "REJECTED",
  };
}
const result = fuseMatch(input, sourceTeams);
// Outputs contain no wall clock timestamp or runtime randomness.
if (values.enriched)
  await Bun.write(values.enriched, JSON.stringify(input, null, 2) + "\n");
await Bun.write(values.output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      algorithm: result.algorithm,
      matchKey: result.matchKey,
      scoreboardThrough: result.scoreboardThrough,
      semanticInputSha256: result.semanticInputSha256,
      alliances: result.alliances.map(({ intervals, ...summary }) => summary),
    },
    null,
    2,
  ),
);

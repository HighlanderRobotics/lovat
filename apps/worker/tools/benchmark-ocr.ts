// Public cached match videos only; download time is intentionally excluded.
// OCR_SERVICE_URL/TOKEN choose the native service. Unset them for the reference.
import {
  extractScoreboard,
  OcrTimelineError,
  templateSchema,
} from "../src/ocr/media";
import { validateEvidence, validateObservations } from "../src/ocr/evidence";
const [video, profile, teams, label, output] = Bun.argv.slice(2);
if (!video || !profile || !teams || !label || !output)
  throw new Error(
    'Usage: bun tools/benchmark-ocr.ts VIDEO PROFILE TEAM1,...,TEAM6 "Qualification 1" OUTPUT',
  );
const template = templateSchema.parse(await Bun.file(profile).json());
const expectedTeams = teams.split(",").map(Number);
if (
  expectedTeams.length !== 6 ||
  new Set(expectedTeams).size !== 6 ||
  expectedTeams.some((n) => !Number.isInteger(n) || n <= 0)
)
  throw new Error("Six distinct team numbers required");
const start = performance.now();
let observations;
try {
  observations = await extractScoreboard(
    "benchmark00",
    expectedTeams,
    label,
    template,
    { localVideo: video },
  );
} catch (error) {
  if (error instanceof OcrTimelineError) observations = error.observations;
  else throw error;
}
const result = {
  backend: process.env.OCR_SERVICE_URL ? "rust-service" : "reference",
  elapsedMs: performance.now() - start,
  complete: validateObservations(observations),
  usable: validateEvidence(observations),
  observations,
};
await Bun.write(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, observations: observations.length }));

import { readFile } from "node:fs/promises";
import {
  templateSchema,
  readScoreboardImage,
  fuelCount,
} from "../src/ocr/media";
const [image, templatePath] = process.argv.slice(2);
if (!image || !templatePath)
  throw Error(
    "Usage: bun tools/inspect-scoreboard.ts <local frame image> <template.json>",
  );
const template = templateSchema.parse(
  JSON.parse(await readFile(templatePath, "utf8")),
);
const observations = await readScoreboardImage(image, template);
console.log(
  JSON.stringify(
    {
      templateVersion: template.version,
      ...observations,
      redFuel: fuelCount(observations.red!.text),
      blueFuel: fuelCount(observations.blue!.text),
    },
    null,
    2,
  ),
);

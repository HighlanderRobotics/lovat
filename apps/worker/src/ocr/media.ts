import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { spawn } from "node:child_process";
import { pngFrames } from "./pngFrames";
import { chooseClock } from "./clock";
import { MatchClock } from "./clock";
import { extractWithService } from "./service";
import { commandFailure } from "./commandFailure";
import { validateObservations, type Observation } from "./evidence";

const box = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().positive().max(1),
    z.number().positive().max(1),
  ])
  .refine(([x, y, w, h]) => x + w <= 1 && y + h <= 1);
// Each season/broadcast needs a reviewed layout. Never interpret a total-points
// counter as fuel: these crops must select cumulative fuel counts specifically.
const layoutSchema = z.object({
  version: z.string().min(1).max(80),
  season: z.literal(2026),
  redFuel: box,
  blueFuel: box,
  clock: box,
  redPoints: box.optional(),
  bluePoints: box.optional(),
  clockAlternatives: z.array(box).max(3).optional(),
  identity: box,
  teams: z.array(box).length(6).optional(),
  matchLabel: box.optional(),
});
export const templateSchema = layoutSchema
  .extend({ alternatives: z.array(layoutSchema).max(3).optional() })
  .refine(
    (template) =>
      new Set([
        template.version,
        ...(template.alternatives ?? []).map((layout) => layout.version),
      ]).size ===
      1 + (template.alternatives?.length ?? 0),
    "Each scoreboard layout needs a unique version",
  )
  .refine(
    (template) =>
      [template, ...(template.alternatives ?? [])].every(
        (layout) => Boolean(layout.redPoints) === Boolean(layout.bluePoints),
      ),
    "Both total-score crops must be configured",
  );
export type Template = z.infer<typeof templateSchema>;

export class OcrTimelineError extends Error {
  constructor(public observations: Observation[]) {
    super(
      `Incomplete or inconsistent OCR timeline (${observations.length} accepted samples)`,
    );
  }
}

async function command(args: string[], timeoutMs: number) {
  const boundedArgs =
    args[0] === "ffmpeg"
      ? [args[0], "-filter_threads", "1", ...args.slice(1)]
      : args;
  const proc = Bun.spawn(boundedArgs, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, OMP_THREAD_LIMIT: "1" },
  });
  const diagnostic = new Response(proc.stderr).text();
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const text = await new Response(proc.stdout).text();
    if ((await proc.exited) !== 0)
      throw commandFailure(args[0] ?? "media", await diagnostic);
    await diagnostic;
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function crop([x, y, w, h]: number[]) {
  return `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},scale=iw*4:ih*4,format=gray`;
}
export function parseTsv(text: string, numeric = false) {
  const words = text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .filter(
      (row) =>
        row.length >= 12 &&
        row[11]!.trim() &&
        (!numeric || /^[\d/:]+$/.test(row[11]!.trim())),
    );
  return {
    text: words.map((row) => row[11]).join(" "),
    confidence: words.length
      ? Math.min(...words.map((row) => Number(row[10])))
      : 0,
  };
}
export function fuelCount(text: string): number {
  const fuel = text.trim().match(/^(\d{1,4})(?:\s*\/\s*\d{1,4})?$/);
  return fuel ? Number(fuel[1]) : NaN;
}

async function* sampleFrames(path: string, limit: number, filter: string) {
  // Node's bounded Readable applies backpressure while OCR consumes one frame.
  // Bun's subprocess iterator can coalesce many completed PNGs into one chunk.
  const proc = spawn(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-i",
      path,
      "-vf",
      `fps=1,${filter}`,
      "-frames:v",
      String(limit),
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const exited = new Promise<number | null>((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", resolve);
  });
  void exited.catch(() => undefined);
  const timeout = setTimeout(() => proc.kill(), 8 * 60000);
  try {
    yield* pngFrames(proc.stdout);
    if ((await exited) !== 0) throw new Error("Incomplete OCR frame stream");
  } finally {
    clearTimeout(timeout);
    proc.kill();
  }
}

async function recognize(file: string, psm = "7", numeric = false) {
  return parseTsv(
    await command(["tesseract", file, "stdout", "--psm", psm, "tsv"], 5000),
    numeric,
  );
}

export async function readScoreboardImage(
  file: string,
  template: Template,
  scratch?: string,
  context?: { tracker: MatchClock; frame: number },
) {
  const directory =
    scratch ?? (await mkdtemp(join(tmpdir(), "lovat-ocr-inspect-")));
  const values: Record<string, { text: string; confidence: number }> = {};
  try {
    const read = async (rectangle: number[], isClock: boolean) => {
      const target = join(directory, "crop.png");
      await command(
        [
          "ffmpeg",
          "-nostdin",
          "-v",
          "error",
          "-threads",
          "1",
          "-y",
          "-i",
          file,
          "-vf",
          `${crop(rectangle)}${isClock ? ",pad=iw+40:ih+40:20:20:white" : ""}`,
          "-frames:v",
          "1",
          target,
        ],
        5000,
      );
      return recognize(target, "7", true);
    };
    values.red = await read(template.redFuel, false);
    values.blue = await read(template.blueFuel, false);
    if (template.redPoints && template.bluePoints) {
      values.redPoints = await read(template.redPoints, false);
      values.bluePoints = await read(template.bluePoints, false);
    }
    const clocks = [];
    for (const rectangle of [
      template.clock,
      ...(template.clockAlternatives ?? []),
    ])
      clocks.push(await read(rectangle, true));
    values.clock = chooseClock(
      clocks,
      context
        ? (seconds, confidence) =>
            context.tracker.plausible(seconds, confidence, context.frame)
        : undefined,
    );
    return values;
  } finally {
    if (!scratch) await rm(directory, { recursive: true, force: true });
  }
}

export async function extractScoreboard(
  videoKey: string,
  expectedTeams: number[],
  expectedMatchLabel: string,
  template: Template,
  options: { localVideo?: string } = {},
): Promise<Observation[]> {
  if (!/^[\w-]{11}$/.test(videoKey) || expectedTeams.length !== 6)
    throw new Error("Invalid video identity");
  const directory = await mkdtemp(join(tmpdir(), "lovat-ocr-"));
  try {
    const path = join(directory, "video.mp4");
    // Dedicated match videos only, no playlists/livestreams, no cookies or URL overrides.
    if (options.localVideo) {
      await copyFile(options.localVideo, path);
    } else {
      await command(
        [
          "yt-dlp",
          "--ignore-config",
          "--js-runtimes",
          "node",
          "--no-playlist",
          "--no-cache-dir",
          "--max-filesize",
          "96M",
          "--match-filter",
          "duration < 600 & !is_live",
          "-f",
          "bestvideo[height<=720]/best[height<=720]",
          "--socket-timeout",
          "15",
          "--retries",
          "1",
          "-o",
          path,
          "--",
          `https://www.youtube.com/watch?v=${videoKey}`,
        ],
        120000,
      );
    }
    const meta = JSON.parse(
      await command(
        ["ffprobe", "-v", "quiet", "-show_format", "-of", "json", path],
        5000,
      ),
    );
    if (
      Number(meta.format.duration) > 600 ||
      Number(meta.format.size) > 96 * 1024 * 1024
    )
      throw new Error("Video exceeds OCR budget");
    if (process.env.OCR_SERVICE_URL) {
      const observations = await extractWithService(
        path,
        expectedTeams,
        expectedMatchLabel,
        template,
        process.env.OCR_SERVICE_URL,
        process.env.OCR_SERVICE_TOKEN ?? "",
      );
      if (!validateObservations(observations))
        throw new OcrTimelineError(observations);
      return observations;
    }
    // One identity frame per second for the first 20 seconds. Keep only one
    // cropped score image at a time; all temporary files disappear in finally.
    let identity = false;
    const layouts = [template, ...(template.alternatives ?? [])];
    const confirmations = new Map<string, number>();
    for await (const frame of sampleFrames(path, 20, "scale=1280:-2")) {
      const source = join(directory, "identity-source.png");
      const target = join(directory, "identity.png");
      await writeFile(source, frame);
      const read = async (rectangle: number[], psm = "7") => {
        await command(
          [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-vf",
            crop(rectangle),
            "-frames:v",
            "1",
            target,
          ],
          5000,
        );
        return recognize(target, psm);
      };
      for (const layout of layouts) {
        let matches = false;
        if (layout.teams && layout.matchLabel) {
          const teams: number[] = [];
          for (const rectangle of layout.teams) {
            const result = await read(rectangle);
            if (result.confidence >= 85 && /^\d+$/.test(result.text))
              teams.push(Number(result.text));
          }
          const title = await read(layout.matchLabel);
          if (
            teams.length === 6 &&
            expectedTeams.every((team) => teams.includes(team)) &&
            title.confidence >= 85 &&
            title.text.toLowerCase().replace(/\s/g, "") ===
              expectedMatchLabel.toLowerCase().replace(/\s/g, "")
          )
            matches = true;
        } else {
          const observed = await read(layout.identity, "6");
          const numbers = new Set(observed.text.match(/\b\d+\b/g)?.map(Number));
          if (
            observed.confidence >= 85 &&
            expectedTeams.every((team) => numbers.has(team)) &&
            observed.text.toLowerCase().replace(/\s/g, "") ===
              expectedMatchLabel.toLowerCase().replace(/\s/g, "")
          )
            matches = true;
        }
        if (matches)
          confirmations.set(
            layout.version,
            (confirmations.get(layout.version) ?? 0) + 1,
          );
        if ((confirmations.get(layout.version) ?? 0) >= 2) {
          template = layout;
          identity = true;
          break;
        }
      }
      if (identity) break;
    }
    if (!identity)
      throw new Error("Match and robot identities could not be validated");
    // Stream one frame at a time; backpressure prevents a match-sized frame cache.
    const observations: Observation[] = [];
    const matchClock = new MatchClock();
    let frameIndex = 0;
    const deadline = Date.now() + 8 * 60000;
    for await (const frame of sampleFrames(path, 600, "scale=1280:-2")) {
      frameIndex++;
      if (Date.now() > deadline)
        throw new Error("OCR exceeded processing budget");
      const framePath = join(directory, "frame.png");
      await writeFile(framePath, frame);
      const values = await readScoreboardImage(framePath, template, directory, {
        tracker: matchClock,
        frame: frameIndex,
      });
      const clock = values.clock!.text.match(/^\s*(?:(\d):)?(\d{1,3})\s*$/);
      const seconds = clock
        ? Number(clock[1] ?? 0) * 60 + Number(clock[2])
        : NaN;
      const time = matchClock.time(
        seconds,
        values.clock!.confidence,
        frameIndex,
      );
      if (time === undefined) continue;
      const pointsConfidence = Math.min(
        values.redPoints?.confidence ?? 0,
        values.bluePoints?.confidence ?? 0,
        values.clock!.confidence,
      );
      const scores =
        pointsConfidence >= 85 &&
        /^\d+$/.test(values.redPoints!.text) &&
        /^\d+$/.test(values.bluePoints!.text)
          ? {
              redPoints: Number(values.redPoints!.text),
              bluePoints: Number(values.bluePoints!.text),
              pointsConfidence,
            }
          : {};
      const sample = {
        ...scores,
        time,
        red: fuelCount(values.red!.text),
        blue: fuelCount(values.blue!.text),
        confidence: Math.min(
          values.red!.confidence,
          values.blue!.confidence,
          values.clock!.confidence,
        ),
      };
      if (
        sample.confidence >= 85 &&
        Number.isFinite(sample.red) &&
        Number.isFinite(sample.blue) &&
        (!observations.length || time > observations.at(-1)!.time)
      )
        observations.push(sample);
    }
    if (!validateObservations(observations))
      throw new OcrTimelineError(observations);
    return observations;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

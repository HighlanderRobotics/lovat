import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
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
export const templateSchema = z.object({
  version: z.string().min(1).max(80),
  season: z.literal(2026),
  redFuel: box,
  blueFuel: box,
  clock: box,
  identity: box,
  teams: z.array(box).length(6).optional(),
  matchLabel: box.optional(),
});
export type Template = z.infer<typeof templateSchema>;

async function command(args: string[], timeoutMs: number) {
  const boundedArgs =
    args[0] === "ffmpeg"
      ? [args[0], "-filter_threads", "1", ...args.slice(1)]
      : args;
  const proc = Bun.spawn(boundedArgs, {
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, OMP_THREAD_LIMIT: "1" },
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const text = await new Response(proc.stdout).text();
    if ((await proc.exited) !== 0) throw new Error("OCR media command failed");
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
  const proc = Bun.spawn(
    [
      "ffmpeg",
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
    { stdout: "pipe", stderr: "ignore" },
  );
  const timeout = setTimeout(() => proc.kill(), 8 * 60000);
  let pending = Buffer.alloc(0);
  try {
    for await (const data of proc.stdout) {
      pending = Buffer.concat([pending, Buffer.from(data)]);
      if (pending.length > 16 * 1024 * 1024)
        throw new Error("OCR frame exceeds memory budget");
      let complete = true;
      while (complete && pending.length >= 8) {
        if (pending.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
          throw new Error("Invalid OCR frame stream");
        let offset = 8;
        complete = false;
        while (pending.length >= offset + 12) {
          const length = pending.readUInt32BE(offset);
          if (length > 16 * 1024 * 1024) throw new Error("Invalid OCR chunk");
          const end = offset + 12 + length;
          if (end > pending.length) break;
          const final =
            pending.toString("ascii", offset + 4, offset + 8) === "IEND";
          offset = end;
          if (final) {
            const frame = pending.subarray(0, end);
            pending = pending.subarray(end);
            yield frame;
            complete = true;
            break;
          }
        }
      }
    }
    if ((await proc.exited) !== 0 || pending.length)
      throw new Error("Incomplete OCR frame stream");
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
) {
  const directory =
    scratch ?? (await mkdtemp(join(tmpdir(), "lovat-ocr-inspect-")));
  const values: Record<string, { text: string; confidence: number }> = {};
  try {
    for (const [key, rectangle] of Object.entries({
      red: template.redFuel,
      blue: template.blueFuel,
      clock: template.clock,
    })) {
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
          crop(rectangle),
          "-frames:v",
          "1",
          target,
        ],
        5000,
      );
      values[key] = await recognize(target, "7", true);
    }
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
): Promise<Observation[]> {
  if (!/^[\w-]{11}$/.test(videoKey) || expectedTeams.length !== 6)
    throw new Error("Invalid video identity");
  const directory = await mkdtemp(join(tmpdir(), "lovat-ocr-"));
  try {
    const path = join(directory, "video.mp4");
    // Dedicated match videos only, no playlists/livestreams, no cookies or URL overrides.
    await command(
      [
        "yt-dlp",
        "--ignore-config",
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
    // One identity frame per second for the first 20 seconds. Keep only one
    // cropped score image at a time; all temporary files disappear in finally.
    let identity = false;
    let confirmations = 0;
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
      if (template.teams && template.matchLabel) {
        const teams: number[] = [];
        for (const rectangle of template.teams) {
          const result = await read(rectangle);
          if (result.confidence >= 85 && /^\d+$/.test(result.text))
            teams.push(Number(result.text));
        }
        const title = await read(template.matchLabel);
        if (
          teams.length === 6 &&
          expectedTeams.every((team) => teams.includes(team)) &&
          title.confidence >= 85 &&
          title.text
            .toLowerCase()
            .replace(/\s/g, "")
            .includes(expectedMatchLabel.toLowerCase().replace(/\s/g, ""))
        )
          confirmations++;
      } else {
        const observed = await read(template.identity, "6");
        const numbers = new Set(observed.text.match(/\b\d+\b/g)?.map(Number));
        if (
          observed.confidence >= 85 &&
          expectedTeams.every((team) => numbers.has(team)) &&
          observed.text
            .toLowerCase()
            .replace(/\s/g, "")
            .includes(expectedMatchLabel.toLowerCase().replace(/\s/g, ""))
        )
          confirmations++;
      }
      if (confirmations >= 2) {
        identity = true;
        break;
      }
    }
    if (!identity)
      throw new Error("Match and robot identities could not be validated");
    // Stream one frame at a time; backpressure prevents a match-sized frame cache.
    const observations: Observation[] = [];
    let phase = "auto",
      lastClock = 21,
      started = false;
    const deadline = Date.now() + 8 * 60000;
    for await (const frame of sampleFrames(path, 600, "scale=1280:-2")) {
      if (Date.now() > deadline)
        throw new Error("OCR exceeded processing budget");
      const framePath = join(directory, "frame.png");
      await writeFile(framePath, frame);
      const values = await readScoreboardImage(framePath, template, directory);
      const clock = values.clock!.text.match(/^\s*(?:(\d):)?(\d{1,3})\s*$/);
      const seconds = clock
        ? Number(clock[1] ?? 0) * 60 + Number(clock[2])
        : NaN;
      if (!started && seconds >= 18 && seconds <= 20) started = true;
      if (!started) continue;
      if (seconds >= 135 && lastClock <= 1) phase = "teleop";
      if (
        !Number.isFinite(seconds) ||
        (phase === "auto" && seconds > 20) ||
        seconds > 140
      )
        continue;
      lastClock = seconds;
      const time = phase === "auto" ? 20 - seconds : 163 - seconds;
      const sample = {
        time,
        red: fuelCount(values.red!.text),
        blue: fuelCount(values.blue!.text),
        confidence: Math.min(
          ...Object.values(values).map((value) => value.confidence),
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
      throw new Error("Incomplete or inconsistent OCR timeline");
    return observations;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

import { readFile } from "node:fs/promises";
import { db } from "@lovat/db";
import { z } from "zod";
import {
  chargedUpReportSchema,
  canRecordEvent,
  activeActivity,
  type ChargedUpEvent,
} from "../src/handler/training/chargedUpReport.js";
import { chargedUpFields } from "../src/handler/training/chargedUpGrading.js";

// Preview by default. --apply creates a new immutable exercise; revisions need a new UUID.
const file = process.argv[2];
if (!file || file.startsWith("--")) {
  throw new Error(
    "Usage: node --import tsx tools/import-charged-up-exercise.ts exercise.json [--apply]",
  );
}
const schema = z.object({
  uuid: z.uuid(),
  matchKey: z.string().min(1),
  videoLink: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ((["youtube.com", "www.youtube.com"].includes(url.hostname) &&
        /^[\w-]{11}$/.test(url.searchParams.get("v") ?? "")) ||
        (url.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname)))
    );
  }, "Use an embeddable HTTPS YouTube video."),
  startOffsetSeconds: z.number().nonnegative(),
  alliance: z.enum(["RED", "BLUE"]),
  excludedFields: z.array(z.enum(chargedUpFields)).default([]),
  answerKey: chargedUpReportSchema,
});
try {
  const input = schema.parse(JSON.parse(await readFile(file, "utf8")));
  const answer = input.answerKey;
  const first = answer.events[0];
  if (
    first?.action !== "START_POSITION" ||
    first.time !== 0 ||
    first.location !== "START_POSITION"
  ) {
    throw new Error("The answer key needs a starting position at 0 seconds.");
  }
  const events: ChargedUpEvent[] = [];
  for (const event of answer.events.slice(1)) {
    if (
      event.time < (events.at(-1)?.time ?? 0) ||
      !canRecordEvent(events, answer.preloadedPiece ?? null, event)
    ) {
      throw new Error(
        "The answer key has an invalid timeline, held piece, or scoring node.",
      );
    }
    events.push(event);
  }
  if (activeActivity(events)) {
    throw new Error("The answer key has an unfinished defence hold.");
  }
  const match = await db.match.findUnique({
    where: { key: input.matchKey },
    include: { teamSlots: true, tournament: true },
  });
  if (
    !match ||
    (match.tournament.seasonYear ?? Number(match.tournamentKey.slice(0, 4))) !==
      2023 ||
    match.tournamentKey !== answer.tournamentKey ||
    !match.teamSlots.some(
      (slot) =>
        slot.teamNumber === answer.teamNumber &&
        slot.matchNumber === answer.matchNumber &&
        slot.matchType === answer.matchType &&
        slot.alliance === input.alliance,
    )
  ) {
    throw new Error(
      "Import the matching 2023 tournament, match, robot, and alliance slot first.",
    );
  }
  if (await db.trainingVideo.findUnique({ where: { uuid: input.uuid } })) {
    throw new Error(
      "Exercise already exists. Use a new UUID for a revised answer key.",
    );
  }
  console.log(
    `Validated Charged Up exercise: ${input.matchKey}, robot ${answer.teamNumber}, 150 seconds.`,
  );
  if (process.argv.includes("--apply")) {
    await db.trainingVideo.create({
      data: {
        uuid: input.uuid,
        matchKey: input.matchKey,
        videoLink: input.videoLink,
        startOffsetSeconds: input.startOffsetSeconds,
        durationSeconds: 150,
        alliance: input.alliance,
        excludedFields: input.excludedFields,
        chargedUpAnswerKey: answer,
      },
    });
    console.log("Created exercise.");
  } else {
    console.log(
      "Preview only. Add --apply to create this exercise in the configured database.",
    );
  }
} finally {
  await db.$disconnect();
}

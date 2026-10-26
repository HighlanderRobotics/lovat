import { expect, test } from "bun:test";
import { commandFailure } from "../src/ocr/commandFailure";
test("reports provider blocking without persisting raw diagnostics or URLs", () => {
  for (const text of [
    "HTTP Error 403 at https://private.invalid/?secret=hidden",
    "Sign in to confirm you are not a bot",
    "HTTP Error 429",
  ])
    expect(commandFailure("yt-dlp", text).message).toBe(
      "The video provider blocked the download.",
    );
});
test("distinguishes unavailable formats and media stages", () => {
  expect(
    commandFailure("yt-dlp", "Requested format is not available").message,
  ).toContain("format");
  expect(commandFailure("yt-dlp", "anything").message).toContain("downloaded");
  expect(commandFailure("ffmpeg", "private diagnostic").message).toBe(
    "The match video could not be decoded.",
  );
  expect(commandFailure("tesseract", "private diagnostic").message).toBe(
    "The scoreboard crop could not be read.",
  );
});

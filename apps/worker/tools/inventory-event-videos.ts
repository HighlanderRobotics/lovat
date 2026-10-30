import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { qualificationVideoInventory } from "../src/ocr/video-inventory";

const [eventKey, matchFile, playlistFile, outputFile] = Bun.argv.slice(2);
if (!eventKey || !matchFile || !playlistFile || !outputFile)
  throw new Error("Use inventory-event-videos.ts EVENT MATCHES_JSON PLAYLIST_JSON NEW_OUTPUT_JSON");
const [matches, playlist] = await Promise.all([readFile(matchFile), readFile(playlistFile)]);
if (matches.length > 8 * 1024 * 1024 || playlist.length > 8 * 1024 * 1024) throw new Error("Inventory inputs exceed budget");
const result = qualificationVideoInventory(eventKey, JSON.parse(matches.toString()), JSON.parse(playlist.toString()).entries ?? []);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
await writeFile(outputFile, JSON.stringify({ fetchedAt: new Date().toISOString(), matchesSha256: hash(matches),
  playlistSha256: hash(playlist), ...result }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ qualifications: result.qualificationMatches, linkedVideos: result.withVideo, missingVideos: result.missingVideos,
  missingUploaderMetadata: result.matches.filter(m => m.uploaderMetadataMissing).map(m => m.matchKey) }));

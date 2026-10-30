import { z } from "zod";

const videoId = /^[A-Za-z0-9_-]{11}$/;
const matchSchema = z.object({
  key: z.string(), comp_level: z.string(), match_number: z.number().int().positive(),
  videos: z.array(z.object({ type: z.string(), key: z.string() })),
});
const entrySchema = z.object({ id: z.string(), title: z.string().nullable() });

/** Availability is separate from successful OCR. Count every official qualifier
 * so a missing upload cannot silently disappear from the denominator. Uploader
 * titles supply candidates only; native roster/match identity must still pass. */
export function qualificationVideoInventory(eventKey: string, rawMatches: unknown, rawEntries: unknown = []) {
  if (!/^2026[a-z0-9]+$/.test(eventKey)) throw new Error("Explicit 2026 event required");
  const matches = z.array(matchSchema).max(500).parse(rawMatches)
    .filter(m => m.comp_level === "qm").sort((a, b) => a.match_number - b.match_number);
  if (!matches.length || new Set(matches.map(m => m.match_number)).size !== matches.length)
    throw new Error("Missing or duplicate qualification schedule");
  if (matches.some(m => m.key !== `${eventKey}_qm${m.match_number}`))
    throw new Error("Qualification event/number identity mismatch");
  const entries = z.array(entrySchema).max(500).parse(rawEntries);
  const rows = matches.map(match => {
    const linked = [...new Set(match.videos.filter(v => v.type === "youtube" && videoId.test(v.key)).map(v => v.key))];
    const exactTitle = `Qualification ${match.match_number} - CalGames 2026`;
    const uploader = eventKey === "2026cacg" ? [...new Set(entries.filter(e => e.title === exactTitle && videoId.test(e.id)).map(e => e.id))].sort() : [];
    const videos = [...linked.map(key => ({ key, source: "TBA" as const })),
      ...uploader.filter(key => !linked.includes(key)).map(key => ({ key, source: "UPLOADER_TITLE_CANDIDATE" as const }))];
    return { matchKey: match.key, matchNumber: match.match_number,
      availability: videos.length ? "LINKED_VIDEO" : "MISSING_VIDEO", videos,
      uploaderMetadataMissing: videos.some(v => entries.some(e => e.id === v.key && e.title === null)) };
  });
  return { eventKey, qualificationMatches: rows.length, withVideo: rows.filter(r => r.videos.length).length,
    missingVideos: rows.filter(r => !r.videos.length).map(r => r.matchKey), matches: rows,
    caveat: "Linked IDs do not prove public download availability, OCR completion or attribution accuracy. Missing uploader metadata is recorded separately. Uploader-title candidates require native match/roster verification." };
}

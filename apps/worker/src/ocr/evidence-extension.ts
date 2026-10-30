import type { extractServiceEvidence } from "./service";
type Evidence = Pick<
  Awaited<ReturnType<typeof extractServiceEvidence>>,
  "observations" | "channels" | "layoutVersion"
>;
/** A recovery experiment may fill gaps, but may not silently change or drop a
 * previously accepted counter. This is a regression guard, not ground truth. */
export function assertEvidenceExtension(
  previous: Evidence,
  candidate: Evidence,
) {
  if (candidate.layoutVersion !== previous.layoutVersion)
    throw Error("Broadcast identity changed");
  const paired = new Map(candidate.observations.map((s) => [s.time, s]));
  if (paired.size !== candidate.observations.length)
    throw Error("Duplicate paired timestamps");
  for (const old of previous.observations) {
    const next = paired.get(old.time);
    if (
      !next ||
      next.red !== old.red ||
      next.blue !== old.blue ||
      next.confidence < 85 ||
      (old.redPoints !== undefined && next.redPoints !== old.redPoints) ||
      (old.bluePoints !== undefined && next.bluePoints !== old.bluePoints)
    )
      throw Error("Previously accepted paired evidence changed");
  }
  for (const color of ["red", "blue"] as const) {
    const channel = new Map(
      candidate.channels?.[color].map((s) => [s.time, s]),
    );
    if (channel.size !== (candidate.channels?.[color].length ?? 0))
      throw Error("Duplicate channel timestamps");
    for (const old of previous.channels?.[color] ?? []) {
      const next = channel.get(old.time);
      if (!next || next.count !== old.count || next.confidence < 85)
        throw Error("Previously accepted channel evidence changed");
    }
  }
  return {
    addedPaired: candidate.observations.length - previous.observations.length,
    addedRed:
      (candidate.channels?.red.length ?? 0) -
      (previous.channels?.red.length ?? 0),
    addedBlue:
      (candidate.channels?.blue.length ?? 0) -
      (previous.channels?.blue.length ?? 0),
  };
}

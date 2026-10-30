// Infer phase from a confident clock and its position in the dedicated match
// video. Seeing 0:00 is not required: OCR often misses that transition frame.
export class MatchClock {
  private origin: number | undefined;
  private teleop = false;
  plausible(seconds: number, confidence: number, frame: number): boolean {
    const candidate = new MatchClock();
    candidate.origin = this.origin;
    candidate.teleop = this.teleop;
    return candidate.time(seconds, confidence, frame) !== undefined;
  }
  time(seconds: number, confidence: number, frame: number): number | undefined {
    if (
      !Number.isInteger(seconds) ||
      !Number.isFinite(confidence) ||
      confidence < 85 ||
      seconds > 140 ||
      seconds < 0
    )
      return;
    if (
      this.origin === undefined &&
      !this.teleop &&
      frame <= 30 &&
      seconds <= 20
    )
      this.origin = frame - (20 - seconds);
    if (this.origin === undefined) return;
    const elapsed = frame - this.origin;
    if (
      !this.teleop &&
      seconds >= 135 &&
      seconds <= 140 &&
      Math.abs(elapsed - (163 - seconds)) <= 3
    )
      this.teleop = true;
    const time = this.teleop
      ? 163 - seconds
      : seconds <= 20
        ? 20 - seconds
        : undefined;
    if (time !== undefined && Math.abs(time - elapsed) <= 3) return time;
  }
}

export function chooseClock(
  readings: { text: string; confidence: number }[],
  plausible?: (seconds: number, confidence: number) => boolean,
) {
  const valid = readings.flatMap((reading) => {
    const seconds = parseClock(reading.text);
    return Number.isFinite(reading.confidence) &&
      reading.confidence >= 85 &&
      seconds !== undefined &&
      (plausible?.(seconds, reading.confidence) ?? true)
      ? [{ ...reading, seconds }]
      : [];
  });
  if (!valid.length || new Set(valid.map((r) => r.seconds)).size !== 1)
    return { text: "", confidence: 0 };
  return valid.sort((a, b) => b.confidence - a.confidence)[0]!;
}

export function parseClock(text: string): number | undefined {
  const match = text.trim().match(/^(?:(\d):([0-5]\d)|(\d{1,3}))$/);
  if (!match) return;
  const seconds =
    match[3] === undefined
      ? Number(match[1]) * 60 + Number(match[2])
      : Number(match[3]);
  if (seconds <= 140) return seconds;
}

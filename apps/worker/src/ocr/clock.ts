// Infer phase from a confident clock and its position in the dedicated match
// video. Seeing 0:00 is not required: OCR often misses that transition frame.
export class MatchClock {
  private origin: number | undefined;
  private teleop = false;
  time(seconds: number, confidence: number, frame: number): number | undefined {
    if (
      !Number.isFinite(seconds) ||
      !Number.isFinite(confidence) ||
      confidence < 85 ||
      seconds > 140 ||
      seconds < 0
    )
      return;
    if (!this.teleop && frame <= 30 && seconds <= 20)
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

export function chooseClock(readings: { text: string; confidence: number }[]) {
  const valid = readings.flatMap((reading) => {
    const match = reading.text.trim().match(/^(?:(\d):)?(\d{1,3})$/);
    const seconds = match ? Number(match[1] ?? 0) * 60 + Number(match[2]) : NaN;
    return reading.confidence >= 85 && seconds <= 140
      ? [{ ...reading, seconds }]
      : [];
  });
  if (!valid.length || new Set(valid.map((r) => r.seconds)).size !== 1)
    return { text: "", confidence: 0 };
  return valid.sort((a, b) => b.confidence - a.confidence)[0]!;
}

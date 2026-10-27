export type Observation = {
  time: number;
  red: number;
  blue: number;
  confidence: number;
  redPoints?: number;
  bluePoints?: number;
  pointsConfidence?: number;
};
export type Claim = {
  eventUuid: string;
  start: number;
  end: number;
  quantity: number;
};
export const OCR_RULE = "alliance-fuel-upper-bound-v1";

// An alliance total cannot identify an individual shooter. Only claims above the
// entire alliance's observed production are candidates; overlap is never guilt.
export function findImpossibleClaims(
  observations: Observation[],
  alliance: "RED" | "BLUE",
  claims: Claim[],
) {
  const color = alliance === "RED" ? "red" : "blue";
  const samples = observations
    .filter((sample) => sample.confidence >= 85)
    .sort((a, b) => a.time - b.time);
  return claims.flatMap((claim) => {
    const before = samples
      .filter((sample) => sample.time <= claim.start - 3)
      .at(-1);
    const after = samples.find((sample) => sample.time >= claim.end + 5);
    if (
      !before ||
      !after ||
      claim.start - before.time > 8 ||
      after.time - claim.end > 10
    )
      return [];
    const window = samples.filter(
      (sample) => sample.time >= before.time && sample.time <= after.time,
    );
    // Do not reason across OCR gaps, score corrections, or missing clock data.
    if (
      window.some(
        (sample, index) =>
          index > 0 &&
          (sample.time - window[index - 1]!.time > 3 ||
            sample[color] < window[index - 1]![color]),
      )
    )
      return [];
    const allianceFuel = after[color] - before[color];
    const allowance = Math.max(5, Math.ceil(allianceFuel * 0.2));
    if (claim.quantity <= allianceFuel + allowance) return [];
    return [
      { ...claim, allianceFuel, allowance, from: before.time, to: after.time },
    ];
  });
}

export function validateObservations(samples: Observation[]): boolean {
  if (samples.length < 120 || samples.length > 600) return false;
  if (samples[0]!.time > 5 || samples.at(-1)!.time < 155) return false;
  return samples.every(
    (sample, index) =>
      Number.isFinite(sample.time) &&
      sample.time >= 0 &&
      sample.time <= 163 &&
      Number.isInteger(sample.red) &&
      sample.red >= 0 &&
      sample.red <= 1000 &&
      Number.isInteger(sample.blue) &&
      sample.blue >= 0 &&
      sample.blue <= 1000 &&
      sample.confidence >= 85 &&
      sample.confidence <= 100 &&
      (index === 0 ||
        (sample.time > samples[index - 1]!.time &&
          sample.time - samples[index - 1]!.time <= 3 &&
          sample.red >= samples[index - 1]!.red &&
          sample.blue >= samples[index - 1]!.blue)),
  );
}

// Missing frames are a coverage limitation, not a reason to discard every other
// independently observed interval. Claim matching still rejects windows with gaps.
export function validateEvidence(samples: Observation[]): boolean {
  if (samples.length < 120 || samples.length > 600) return false;
  return samples.every(
    (sample, index) =>
      Number.isFinite(sample.time) &&
      sample.time >= 0 &&
      sample.time <= 163 &&
      Number.isInteger(sample.red) &&
      sample.red >= 0 &&
      sample.red <= 1000 &&
      Number.isInteger(sample.blue) &&
      sample.blue >= 0 &&
      sample.blue <= 1000 &&
      Number.isFinite(sample.confidence) &&
      sample.confidence >= 85 &&
      sample.confidence <= 100 &&
      (index === 0 ||
        (sample.time > samples[index - 1]!.time &&
          sample.red >= samples[index - 1]!.red &&
          sample.blue >= samples[index - 1]!.blue)),
  );
}

// TBA-constrained estimates use independently observed intervals. Review flags
// retain their stricter validator above. This measures time coverage rather than
// discarding a video solely because fewer than 120 timestamps were readable.
export function estimateCoverage(samples: Observation[]) {
  const denseSeconds = samples.slice(1).reduce((sum, s, i) => {
    const gap = s.time - samples[i]!.time;
    return sum + (gap > 0 && gap <= 3 ? gap : 0);
  }, 0);
  return {
    samples: samples.length,
    denseSeconds,
    fraction: denseSeconds / 163,
    first: samples[0]?.time ?? null,
    last: samples.at(-1)?.time ?? null,
  };
}
export function validateEstimateEvidence(samples: Observation[]): boolean {
  const q = estimateCoverage(samples);
  return (
    samples.length >= 2 &&
    samples.length <= 600 &&
    q.denseSeconds >= 163 / 2 &&
    q.first !== null &&
    q.first <= 20 &&
    q.last !== null &&
    q.last >= 155 &&
    samples.every(
      (s, i) =>
        Number.isFinite(s.time) &&
        s.time >= 0 &&
        s.time <= 163 &&
        Number.isInteger(s.red) &&
        s.red >= 0 &&
        s.red <= 1000 &&
        Number.isInteger(s.blue) &&
        s.blue >= 0 &&
        s.blue <= 1000 &&
        Number.isFinite(s.confidence) &&
        s.confidence >= 85 &&
        s.confidence <= 100 &&
        (i === 0 || s.time > samples[i - 1]!.time),
    )
  );
}

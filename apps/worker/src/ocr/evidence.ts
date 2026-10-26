export type Observation = {
  time: number;
  red: number;
  blue: number;
  confidence: number;
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

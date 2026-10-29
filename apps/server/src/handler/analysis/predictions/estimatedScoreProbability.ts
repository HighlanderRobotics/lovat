export type EstimatedProbabilities = {
  redWinning: number;
  blueWinning: number;
  winningAlliance: 0 | 1;
};

export function predictEstimatedScores(
  series: number[][],
  fouls: [number[], number[]] = [[0], [0]],
): EstimatedProbabilities {
  if (
    series.length !== 6 ||
    fouls.length !== 2 ||
    fouls.some(
      (a) => !a.length || a.some((n) => !Number.isFinite(n) || n < 0),
    ) ||
    series.some(
      (a) => a.length < 2 || a.some((n) => !Number.isFinite(n) || n < 0),
    )
  )
    throw "not enough data";
  const samples = [...series, ...fouls];
  const means = samples.map((a) => a.reduce((s, n) => s + n, 0) / a.length);
  const variances = samples.map(
    (a, i) => a.reduce((s, n) => s + (n - means[i]) ** 2, 0) / a.length,
  );
  const difference =
    means.slice(0, 3).reduce((s, n) => s + n, 0) -
    means.slice(3, 6).reduce((s, n) => s + n, 0) +
    means[6] -
    means[7];
  const sd = Math.sqrt(variances.reduce((s, n) => s + n, 0));
  const zScore = sd === 0 ? 0 : difference / sd;
  let redWinning = difference === 0 ? 0.5 : difference > 0 ? 1 : 0;
  if (sd !== 0) {
    const x = Math.abs(zScore),
      t = 1 / (1 + 0.2316419 * x);
    const tail =
      (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
      t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    redWinning = zScore >= 0 ? 1 - tail : tail;
  }
  return {
    redWinning,
    blueWinning: 1 - redWinning,
    winningAlliance: redWinning >= 0.5 ? 0 : 1,
  };
}

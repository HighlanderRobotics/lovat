import { HttpError } from "../errors.js";
export function prediction(series: readonly (readonly number[])[]) {
  if (series.length !== 6 || series.some((a) => a.length < 2))
    throw new HttpError(
      422,
      "INSUFFICIENT_DATA",
      "At least two matches are needed for each team",
    );
  const means = series.map((a) => a.reduce((sum, n) => sum + n, 0) / a.length);
  const variance = series.map(
    (a, i) => a.reduce((sum, n) => sum + (n - means[i]) ** 2, 0) / a.length,
  );
  const difference =
    means.slice(0, 3).reduce((s, n) => s + n, 0) -
    means.slice(3).reduce((s, n) => s + n, 0);
  const deviation = Math.sqrt(variance.reduce((s, n) => s + n, 0));
  const redWinning =
    deviation === 0
      ? difference === 0
        ? 0.5
        : difference > 0
          ? 1
          : 0
      : normalCdf(difference / deviation);
  return {
    redWinning,
    blueWinning: 1 - redWinning,
    winningAlliance: redWinning >= 0.5 ? 0 : 1,
  };
}
export function normalCdf(value: number) {
  const x = Math.abs(value),
    t = 1 / (1 + 0.2316419 * x);
  const density = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const tail =
    density *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return value >= 0 ? 1 - tail : tail;
}
export function csv(
  rows: readonly Record<string, unknown>[],
  columns: string[],
) {
  const cell = (value: unknown) => {
    const text =
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value ?? "");
    // Prevent spreadsheet formula execution when users export scouting notes.
    const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      columns.map(cell).join(","),
      ...rows.map((row) =>
        columns.map((column) => cell(row[column])).join(","),
      ),
    ].join("\r\n")
  );
}

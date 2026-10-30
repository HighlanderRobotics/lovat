export function ocrTournamentKeys(
  value = process.env.OCR_TOURNAMENT_KEYS,
): string[] | undefined {
  if (value === undefined) return undefined;
  const keys = [
    ...new Set(
      value
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
  if (
    !keys.length ||
    keys.length > 100 ||
    keys.some((key) => !/^2026[a-z0-9]+$/.test(key))
  )
    throw new Error("OCR_TOURNAMENT_KEYS must name 2026 tournament keys");
  return keys;
}
export function ocrTournamentAllowed(key: string): boolean {
  return ocrTournamentKeys()?.includes(key) ?? true;
}

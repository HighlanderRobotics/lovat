type Sequence = {
  level: number;
  set: number;
  number: number;
  scheduled: number | null;
  actual: number | null;
  display?: number | null;
};

export function orderMatches<T>(
  matches: T[],
  sequence: (match: T) => Sequence,
  doubleElimination = false,
) {
  const entries = matches.map((match) => ({ match, order: sequence(match) }));

  // Choose one clock for the whole schedule; mixing clocks can skip matches.
  const clock = entries.every(({ order }) => order.actual !== null)
    ? "actual"
    : entries.every(({ order }) => order.scheduled !== null)
      ? "scheduled"
      : null;
  const hasDisplay = entries.every(({ order }) => order.display != null);

  return entries
    .sort(({ order: a }, { order: b }) => {
      if (clock) {
        const difference = a[clock]! - b[clock]!;

        if (difference) return difference;
      } else if (hasDisplay) {
        const difference = a.display! - b.display!;

        if (difference) return difference;
      }

      // Traditional brackets alternate series within each round of games.
      return (
        a.level - b.level ||
        (doubleElimination
          ? a.set - b.set || a.number - b.number
          : a.number - b.number || a.set - b.set)
      );
    })
    .map(({ match }) => match);
}

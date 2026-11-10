import { expect, test } from "bun:test";
import { orderMatches } from "../src/match-order";

function match(set: number, number: number, scheduled: number | null = null) {
  return { level: 1, set, number, scheduled, actual: null, display: null };
}

test("traditional brackets alternate series even before times are published", () => {
  const matches = [match(1, 2), match(2, 1), match(2, 2), match(1, 1)];

  expect(orderMatches(matches, (value) => value)).toEqual([
    matches[3]!,
    matches[1]!,
    matches[0]!,
    matches[2]!,
  ]);
});

test("double elimination keeps numbered bracket games before finals", () => {
  const matches = [match(2, 1), match(1, 1), match(3, 1)];

  expect(orderMatches(matches, (value) => value, true)).toEqual([
    matches[1]!,
    matches[0]!,
    matches[2]!,
  ]);
});

test("actual sequence wins over scheduled sequence when every match has started", () => {
  const matches = [
    { ...match(1, 1, 10), actual: 30 },
    { ...match(2, 1, 20), actual: 20 },
  ];

  expect(orderMatches(matches, (value) => value)).toEqual(
    [...matches].reverse(),
  );
});

test("partial actual timing does not reorder remaining scheduled matches", () => {
  const matches = [{ ...match(1, 1, 10), actual: 30 }, match(2, 1, 20)];

  expect(orderMatches(matches, (value) => value)).toEqual(matches);
});

test("imported display order is used when a complete timing clock is unavailable", () => {
  const matches = [
    { ...match(1, 1), display: 2 },
    { ...match(2, 1, 20), display: 1 },
  ];

  expect(orderMatches(matches, (value) => value)).toEqual(
    [...matches].reverse(),
  );
});

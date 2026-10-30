import { test, expect } from "bun:test";
import { MatchClock, parseClock, chooseClock } from "../src/ocr/clock";
test("clock syntax cannot reinterpret malformed minute/second digits as elapsed time", () => {
  for (const [text, seconds] of [
    ["2:20", 140],
    ["1:32", 92],
    ["0:59", 59],
    ["0:00", 0],
    ["20", 20],
    ["140", 140],
    [" 01 ", 1],
  ] as const)
    expect(parseClock(text)).toBe(seconds);
  for (const text of [
    "0:90",
    "1:60",
    "1:032",
    "2:2",
    "3:00",
    "141",
    "-1",
    "+20",
    "1/20",
    "",
    "0:999",
    "1:00:00",
  ])
    expect(parseClock(text)).toBeUndefined();
  expect(
    chooseClock([
      { text: "0:90", confidence: 99 },
      { text: "1:30", confidence: 90 },
    ]).text,
  ).toBe("1:30");
  expect(chooseClock([{ text: "1:30", confidence: Infinity }]).confidence).toBe(
    0,
  );
  expect(new MatchClock().time(1.5, 95, 1)).toBeUndefined();
});
test("identifies teleop without observing the last autonomous second", () => {
  const clock = new MatchClock();
  expect(clock.time(20, 95, 7)).toBe(0);
  expect(clock.time(3, 95, 24)).toBe(17);
  expect(clock.time(140, 95, 30)).toBe(23);
  expect(clock.time(120, 95, 50)).toBe(43);
  expect(clock.time(1, 95, 51)).toBeUndefined();
});
test("declines low confidence, impossible transitions, and late starts", () => {
  expect(new MatchClock().time(20, 95, 150)).toBeUndefined();
  const clock = new MatchClock();
  clock.time(20, 95, 7);
  expect(clock.time(140, 95, 8)).toBeUndefined();
  expect(clock.time(0, 10, 9)).toBeUndefined();
  expect(clock.time(NaN, 95, 10)).toBeUndefined();
});
test("uses the observed clock when a video starts after autonomous is underway", () => {
  const clock = new MatchClock();
  expect(clock.time(15, 95, 1)).toBe(5);
  expect(clock.time(140, 95, 19)).toBe(23);
});
test("uses reviewed clock positions but rejects conflicting confident readings", async () => {
  const { chooseClock } = await import("../src/ocr/clock");
  expect(
    chooseClock([
      { text: "2:20", confidence: 96 },
      { text: "140", confidence: 90 },
    ]).text,
  ).toBe("2:20");
  expect(
    chooseClock([
      { text: "2:20", confidence: 96 },
      { text: "1:20", confidence: 90 },
    ]).confidence,
  ).toBe(0);
  expect(
    chooseClock([
      { text: "junk", confidence: 99 },
      { text: "2:20", confidence: 90 },
    ]).text,
  ).toBe("2:20");
});

test("an alternate clock must fit observed video time before it can veto a reading", async () => {
  const { chooseClock } = await import("../src/ocr/clock");
  const clock = new MatchClock();
  clock.time(20, 95, 7);
  clock.time(140, 95, 30);
  const plausible = (seconds: number, confidence: number) =>
    clock.plausible(seconds, confidence, 50);
  expect(
    chooseClock(
      [
        { text: "2:00", confidence: 95 },
        { text: "1", confidence: 98 },
      ],
      plausible,
    ).text,
  ).toBe("2:00");
  expect(
    chooseClock(
      [
        { text: "2:00", confidence: 95 },
        { text: "1:59", confidence: 98 },
      ],
      plausible,
    ).confidence,
  ).toBe(0);
});
test("a stray early clock cannot move the match origin or mutate phase through a plausibility check", () => {
  const clock = new MatchClock();
  expect(clock.time(20, 95, 7)).toBe(0);
  expect(clock.time(1, 95, 8)).toBeUndefined();
  expect(clock.plausible(140, 95, 30)).toBe(true);
  expect(clock.time(19, 95, 8)).toBe(1);
});

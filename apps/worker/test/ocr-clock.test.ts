import { test, expect } from "bun:test";
import { MatchClock } from "../src/ocr/clock";
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

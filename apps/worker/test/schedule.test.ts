import { expect, test } from "bun:test";
import { day, hour, minute, tournamentCadence } from "../src/schedule";
import { retryDelay } from "../src/scheduler";
import { TbaHttpError } from "../src/providers/tba";

const event = {
  startDate: new Date("2026-03-05T00:00:00Z"),
  endDate: new Date("2026-03-07T00:00:00Z"),
  timezone: "America/Los_Angeles",
};

test("uses local event dates, including the last day after UTC midnight", () => {
  expect(tournamentCadence(event, new Date("2026-03-08T03:00:00Z"))).toEqual({
    phase: "active",
    matches: minute,
    roster: hour,
  });
  expect(tournamentCadence(event, new Date("2026-03-05T03:00:00Z"))).toEqual({
    phase: "upcoming",
    matches: 30 * minute,
    roster: 6 * hour,
  });
  expect(tournamentCadence(event, new Date("2026-03-06T10:00:00Z"))).toEqual({
    phase: "active",
    matches: 15 * minute,
    roster: hour,
  });
});

test("backs off outside tournament days and tolerates missing timezone data", () => {
  expect(
    tournamentCadence(event, new Date("2026-02-01T12:00:00Z")).matches,
  ).toBe(day);
  expect(
    tournamentCadence(event, new Date("2026-03-09T12:00:00Z")).matches,
  ).toBe(6 * hour);
  expect(
    tournamentCadence(event, new Date("2026-04-01T12:00:00Z")).matches,
  ).toBe(7 * day);
  expect(tournamentCadence({ ...event, startDate: null }).phase).toBe(
    "unknown",
  );
  expect(
    tournamentCadence(
      { ...event, timezone: "invalid" },
      new Date("2026-03-06T12:00:00Z"),
    ).phase,
  ).toBe("active");
});

test("retry delays honor exponential backoff and both forms of Retry-After", () => {
  const now = new Date("2026-03-06T12:00:00Z");

  expect(retryDelay(0, new Error())).toBe(minute);
  expect(retryDelay(2, new Error())).toBe(4 * minute);
  expect(retryDelay(20, new Error())).toBe(hour);
  expect(retryDelay(0, new TbaHttpError("status", 429, "300"), now)).toBe(
    5 * minute,
  );
  expect(
    retryDelay(
      0,
      new TbaHttpError("status", 503, "Fri, 06 Mar 2026 12:10:00 GMT"),
      now,
    ),
  ).toBe(10 * minute);
  expect(retryDelay(0, new TbaHttpError("status", 503, "invalid"), now)).toBe(
    minute,
  );
});

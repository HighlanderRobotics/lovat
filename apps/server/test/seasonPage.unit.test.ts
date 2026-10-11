import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { season: { findUnique } },
}));

import { getSeason } from "../src/handler/tournaments/getSeason.js";

beforeEach(() => vi.resetAllMocks());

it("returns public season districts and events without team or scouting data", async () => {
  const season = {
    year: 2026,
    gameName: "REBUILT",
    districtSeasons: [],
    tournaments: [],
  };
  findUnique.mockResolvedValue(season);

  const res = await invoke(getSeason, { params: { year: "2026" } });
  const query = findUnique.mock.calls[0]![0];

  expect(query.where).toEqual({ year: 2026 });
  expect(query.select.districtSeasons.select).toEqual({
    key: true,
    abbreviation: true,
    name: true,
  });
  expect(query.select.tournaments.where).toEqual({ districtSeasonKey: null });
  expect(query.select.tournaments.select).toEqual({
    key: true,
    name: true,
    location: true,
    startDate: true,
    endDate: true,
  });
  expect(JSON.stringify(query)).not.toContain("teamSeasons");
  expect(JSON.stringify(query)).not.toContain("scoutReports");
  expect(res.body).toEqual(season);
  expect(res.headers["Cache-Control"]).toBe("public, max-age=300");
});

it("returns 404 for an unimported season", async () => {
  findUnique.mockResolvedValue(null);

  expect(
    (await invoke(getSeason, { params: { year: "2026" } })).statusCode,
  ).toBe(404);
});

it("rejects invalid keys before querying", async () => {
  expect(
    (await invoke(getSeason, { params: { year: "../private" } })).statusCode,
  ).toBe(400);
  expect(findUnique).not.toHaveBeenCalled();
});

it("does not expose database errors", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));

  const res = await invoke(getSeason, { params: { year: "2026" } });

  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({
    error: "Season data is temporarily unavailable",
  });
});

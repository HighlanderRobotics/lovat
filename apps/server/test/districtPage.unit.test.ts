import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { districtSeason: { findUnique } },
}));

import { getDistrict } from "../src/handler/tournaments/getDistrict.js";

beforeEach(() => vi.resetAllMocks());

it("returns the requested district with public events and season teams", async () => {
  const district = {
    key: "2026ca",
    name: "FIRST California",
    tournaments: [],
    teamSeasons: [],
  };
  findUnique.mockResolvedValue(district);

  const res = await invoke(getDistrict, { params: { key: "2026ca" } });
  const query = findUnique.mock.calls[0]![0];

  expect(query.where).toEqual({ key: "2026ca" });
  expect(query.select.teamSeasons.select).toEqual({
    teamNumber: true,
    team: { select: { registeredTeam: { select: { teamApproved: true } } } },
    name: true,
    city: true,
    stateProvince: true,
  });
  expect(query.select.tournaments.select).toEqual({
    key: true,
    parentTournamentKey: true,
    week: true,
    eventType: true,
    name: true,
    location: true,
    startDate: true,
    endDate: true,
  });
  expect(JSON.stringify(query)).not.toContain("scoutReports");
  expect(res.body).toEqual(district);
  expect(res.headers["Cache-Control"]).toBe("public, max-age=300");
});

it("returns 404 for an unimported district", async () => {
  findUnique.mockResolvedValue(null);

  expect(
    (await invoke(getDistrict, { params: { key: "2026missing" } })).statusCode,
  ).toBe(404);
});

it("rejects invalid keys before querying", async () => {
  expect(
    (await invoke(getDistrict, { params: { key: "../private" } })).statusCode,
  ).toBe(400);
  expect(findUnique).not.toHaveBeenCalled();
});

it("does not expose database errors", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));

  const res = await invoke(getDistrict, { params: { key: "2026ca" } });

  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({
    error: "District data is temporarily unavailable",
  });
});

it("projects only the public registration flag for district teams", async () => {
  findUnique.mockResolvedValue({
    key: "2026ca",
    teamSeasons: [
      {
        teamNumber: 8033,
        name: "Highlander Robotics",
        team: { registeredTeam: { teamApproved: true, code: "private" } },
      },
      { teamNumber: 1, name: "One", team: { registeredTeam: null } },
      {
        teamNumber: 2,
        name: "Two",
        team: { registeredTeam: { teamApproved: false } },
      },
    ],
  });
  const response = await invoke(getDistrict, { params: { key: "2026ca" } });
  expect(response.body).toEqual({
    key: "2026ca",
    teamSeasons: [
      { teamNumber: 8033, name: "Highlander Robotics", usesLovat: true },
      { teamNumber: 1, name: "One", usesLovat: false },
      { teamNumber: 2, name: "Two", usesLovat: false },
    ],
  });
});

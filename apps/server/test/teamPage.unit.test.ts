import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { teamSeason: { findUnique } },
}));

import { getTeamSeason } from "../src/handler/tournaments/getTeamSeason.js";

beforeEach(() => vi.resetAllMocks());

it("returns public season data and only this team's awards", async () => {
  findUnique.mockResolvedValue({
    teamNumber: 8033,
    seasonYear: 2026,
    name: "Highlanders",
    avatar: null,
    district: null,
    team: {
      seasons: [{ seasonYear: 2026 }, { seasonYear: 2025 }],
      tournamentTeams: [
        {
          tournament: {
            key: "2026cancmp",
            awards: [
              { name: "Winner", recipients: [{ teamNumber: 8033 }] },
              { name: "Impact", recipients: [{ teamNumber: 254 }] },
              null,
              { name: "Invalid", recipients: null },
            ],
          },
        },
      ],
    },
  });

  const res = await invoke(getTeamSeason, {
    params: { number: "8033", year: "2026" },
  });
  const query = findUnique.mock.calls[0]![0];

  expect(query.where).toEqual({
    teamNumber_seasonYear: { teamNumber: 8033, seasonYear: 2026 },
  });
  expect(query.select.team.select.tournamentTeams.where).toEqual({
    tournament: { seasonYear: 2026 },
  });
  expect(JSON.stringify(query)).not.toContain("scoutReports");
  expect(JSON.stringify(query)).not.toContain("matchData");
  expect(res.body).toMatchObject({
    teamNumber: 8033,
    seasonYears: [2026, 2025],
    tournaments: [{ key: "2026cancmp", awards: ["Winner"] }],
  });
  expect(res.body).not.toHaveProperty("team");
  expect(res.headers["Cache-Control"]).toBe("public, max-age=300");
});

it.each([
  ["0", "2026"],
  ["1e3", "2026"],
  ["2147483648", "2026"],
  ["8033", "1991"],
  ["8033", "../2026"],
])("rejects invalid keys before querying: %s %s", async (number, year) => {
  expect(
    (await invoke(getTeamSeason, { params: { number, year } })).statusCode,
  ).toBe(400);
  expect(findUnique).not.toHaveBeenCalled();
});

it("returns 404 for an unimported season", async () => {
  findUnique.mockResolvedValue(null);

  expect(
    (await invoke(getTeamSeason, { params: { number: "8033", year: "2026" } }))
      .statusCode,
  ).toBe(404);
});

it("does not expose private database errors", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));

  const res = await invoke(getTeamSeason, {
    params: { number: "8033", year: "2026" },
  });

  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({ error: "Team data is temporarily unavailable" });
});

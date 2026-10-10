import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { tournament: { findUnique } },
}));

import { getTournament } from "../src/handler/tournaments/getTournament.js";

beforeEach(() => vi.resetAllMocks());

it("returns explicitly selected public data without report relations", async () => {
  const tournament = { key: "2026cancmp", matches: [], gaps: [], teams: [] };
  findUnique.mockResolvedValue(tournament);

  const res = await invoke(getTournament, { params: { key: "2026cancmp" } });
  const query = findUnique.mock.calls[0]![0];

  expect(query.where).toEqual({ key: "2026cancmp" });
  expect(query.select.matches.select.teamSlots.select).toEqual({
    teamNumber: true,
    alliance: true,
    station: true,
    surrogate: true,
    disqualified: true,
  });
  expect(JSON.stringify(query)).not.toContain("scoutReports");
  expect(res.body).toEqual(tournament);
  expect(res.headers["Cache-Control"]).toBe("public, max-age=30");
});

it("returns 404 when the event has not been imported", async () => {
  findUnique.mockResolvedValue(null);

  expect(
    (await invoke(getTournament, { params: { key: "2026cancmp" } })).statusCode,
  ).toBe(404);
});

it("does not expose database errors", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));

  const res = await invoke(getTournament, { params: { key: "2026cancmp" } });

  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({
    error: "Tournament data is temporarily unavailable",
  });
});

it("uses the requested event key", async () => {
  findUnique.mockResolvedValue({ key: "2026casj", teams: [] });

  const res = await invoke(getTournament, { params: { key: "2026casj" } });

  expect(findUnique.mock.calls[0]![0].where).toEqual({ key: "2026casj" });
  expect(res.body).toEqual({ key: "2026casj", teams: [] });
});

it("rejects invalid keys without querying the database", async () => {
  expect(
    (await invoke(getTournament, { params: { key: "../private" } })).statusCode,
  ).toBe(400);
  expect(findUnique).not.toHaveBeenCalled();
});

it("uses the event season name and avatar without exposing season metadata", async () => {
  findUnique.mockResolvedValue({
    key: "2025casj",
    teams: [
      {
        team: {
          number: 254,
          name: "Current",
          seasons: [
            { name: "Season name", avatar: "data:image/png;base64,abc" },
          ],
        },
      },
    ],
  });

  const res = await invoke(getTournament, { params: { key: "2025casj" } });

  expect(res.body).toEqual({
    key: "2025casj",
    teams: [
      {
        team: {
          number: 254,
          name: "Season name",
          avatar: "data:image/png;base64,abc",
        },
      },
    ],
  });
});

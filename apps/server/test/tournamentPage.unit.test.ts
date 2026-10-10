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

  const res = await invoke(getTournament);
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

  expect((await invoke(getTournament)).statusCode).toBe(404);
});

it("does not expose database errors", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));

  const res = await invoke(getTournament);

  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({
    error: "Tournament data is temporarily unavailable",
  });
});

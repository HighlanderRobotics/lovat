import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { match: { findUnique } },
}));

import { getMatch } from "../src/handler/tournaments/getMatch.js";

beforeEach(() => vi.resetAllMocks());

it("selects only official match breakdowns, without scouting relations", async () => {
  const match = {
    key: "2026casnf_qm4",
    alliances: [{ color: "RED", scoreBreakdown: { autoPoints: 32 } }],
  };
  findUnique.mockResolvedValue(match);

  const res = await invoke(getMatch, { params: { key: match.key } });

  expect(findUnique).toHaveBeenCalledWith({
    where: { key: match.key },
    select: {
      key: true,
      alliances: {
        orderBy: { color: "asc" },
        select: { color: true, scoreBreakdown: true },
      },
    },
  });
  expect(res.body).toEqual(match);
  expect(res.headers["Cache-Control"]).toBe("public, max-age=30");
});

it.each(["../private", "2026casnf", "2026casnf_qm0"])(
  "rejects malformed keys before querying: %s",
  async (key) => {
    expect((await invoke(getMatch, { params: { key } })).statusCode).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  },
);

it("returns 404 for an unimported match", async () => {
  findUnique.mockResolvedValue(null);
  expect(
    (await invoke(getMatch, { params: { key: "2026casnf_sf1m1" } })).statusCode,
  ).toBe(404);
});

it("hides database errors", async () => {
  findUnique.mockRejectedValue(new Error("private database details"));
  const res = await invoke(getMatch, { params: { key: "2026casnf_qm4" } });
  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({ error: "Match data is temporarily unavailable" });
});

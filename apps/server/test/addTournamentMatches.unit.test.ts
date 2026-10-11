import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const database = vi.hoisted(() => ({
  findTournament: vi.fn(),
  updateTournament: vi.fn(),
  upsertMatch: vi.fn(),
}));

vi.mock("../src/prismaClient.js", () => ({
  default: {
    tournament: {
      findUnique: database.findTournament,
      update: database.updateTournament,
    },
    teamMatchData: { upsert: database.upsertMatch },
  },
}));
vi.mock("../src/handler/manager/addPracticeMatches.js", () => ({
  addPracticeMatches: vi.fn(),
}));

import { addPracticeMatches } from "../src/handler/manager/addPracticeMatches.js";
import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";

describe("coordinating TBA and practice imports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("TBA_KEY", "synthetic-test-key");
    database.findTournament.mockResolvedValue({
      key: "2026test",
      latestFetchETag: "stored-etag",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Axios identifies this as an HTTP 304 response from its match request.
    const unchanged = Object.assign(new Error("Not modified"), {
      isAxiosError: true,
      response: { status: 304 },
    });
    vi.spyOn(axios, "get").mockRejectedValue(unchanged);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("imports practice even when TBA's schedule has not changed", async () => {
    await addTournamentMatches("2026test");

    expect(axios.get).toHaveBeenCalledWith(
      "https://www.thebluealliance.com/api/v3/event/2026test/matches",
      expect.objectContaining({
        headers: expect.objectContaining({ "If-None-Match": "stored-etag" }),
      }),
    );
    expect(database.updateTournament).not.toHaveBeenCalled();
    expect(database.upsertMatch).not.toHaveBeenCalled();
    expect(addPracticeMatches).toHaveBeenCalledExactlyOnceWith("2026test");
  });

  it("still attempts practice import when TBA fails", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("TBA unavailable"));

    await addTournamentMatches("2026test");

    expect(addPracticeMatches).toHaveBeenCalledExactlyOnceWith("2026test");
  });

  it("logs a practice import failure without rejecting the overall import", async () => {
    const failure = new Error("Nexus unavailable");
    vi.mocked(addPracticeMatches).mockRejectedValue(failure);

    await expect(addTournamentMatches("2026test")).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "Failed to import Nexus practice matches",
      failure,
    );
  });
});

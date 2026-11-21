import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findTournament: vi.fn(),
  updateTournament: vi.fn(),
  upsertMatch: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("../src/prismaClient.js", () => ({
  default: {
    tournament: {
      findUnique: database.findTournament,
      update: database.updateTournament,
    },
    teamMatchData: { upsert: database.upsertMatch },
    importJob: { upsert: database.enqueue },
  },
}));
vi.mock("../src/handler/manager/addPracticeMatches.js", () => ({
  addPracticeMatches: vi.fn(),
}));

import { addPracticeMatches } from "../src/handler/manager/addPracticeMatches.js";
import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";

describe("coordinating official refreshes and practice imports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.findTournament.mockResolvedValue({
      key: "2026test",
      latestFetchETag: "stored-etag",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("imports practice while leaving official schedules and refresh backoff to the worker", async () => {
    await addTournamentMatches("2026test");

    expect(database.enqueue).toHaveBeenCalledWith({
      where: { kind_targetKey: { kind: "matches", targetKey: "2026test" } },
      update: {},
      create: {
        kind: "matches",
        targetKey: "2026test",
        runAt: expect.any(Date),
      },
    });
    expect(database.updateTournament).not.toHaveBeenCalled();
    expect(database.upsertMatch).not.toHaveBeenCalled();
    expect(addPracticeMatches).toHaveBeenCalledExactlyOnceWith("2026test");
  });

  it("still attempts practice import when queueing the official refresh fails", async () => {
    database.enqueue.mockRejectedValue(new Error("Queue unavailable"));

    await addTournamentMatches("2026test");

    expect(addPracticeMatches).toHaveBeenCalledExactlyOnceWith("2026test");
  });

  it("does not import practice for unknown tournaments", async () => {
    database.findTournament.mockResolvedValue(null);

    await addTournamentMatches("2026missing");

    expect(database.enqueue).not.toHaveBeenCalled();
    expect(addPracticeMatches).not.toHaveBeenCalled();
  });

  it("keeps reads available if the tournament lookup fails", async () => {
    database.findTournament.mockRejectedValue(
      new Error("Database unavailable"),
    );

    await expect(addTournamentMatches("2026test")).resolves.toBeUndefined();

    expect(addPracticeMatches).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Unable to queue tournament match refresh",
    );
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

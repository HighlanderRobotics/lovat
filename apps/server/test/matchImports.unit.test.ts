import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tournament: { findUnique: vi.fn(), update: vi.fn() },
  teamMatchData: { upsert: vi.fn() },
  importJob: { upsert: vi.fn() },
}));

vi.mock("../src/prismaClient.js", () => ({ default: mocks }));

import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tournament.findUnique.mockResolvedValue({ key: "2026test" });
});

afterEach(() => vi.restoreAllMocks());

it("queues worker-owned refreshes without changing participants or legacy validators", async () => {
  await addTournamentMatches("2026test");

  expect(mocks.importJob.upsert).toHaveBeenCalledWith({
    where: { kind_targetKey: { kind: "matches", targetKey: "2026test" } },
    update: {},
    create: { kind: "matches", targetKey: "2026test", runAt: expect.any(Date) },
  });
  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
  expect(mocks.tournament.update).not.toHaveBeenCalled();
});

it.each([undefined, "", "   "])(
  "ignores invalid tournament keys (%s)",
  async (key) => {
    await addTournamentMatches(key as string);

    expect(mocks.tournament.findUnique).not.toHaveBeenCalled();
    expect(mocks.importJob.upsert).not.toHaveBeenCalled();
  },
);

it("does not queue unknown tournaments", async () => {
  mocks.tournament.findUnique.mockResolvedValue(null);

  await addTournamentMatches("2026missing");

  expect(mocks.importJob.upsert).not.toHaveBeenCalled();
});

it("supports historical seasons without a hardcoded season gate", async () => {
  await addTournamentMatches("2025test");

  expect(mocks.importJob.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { kind_targetKey: { kind: "matches", targetKey: "2025test" } },
    }),
  );
});

it("keeps stored-match reads available if enqueueing fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.importJob.upsert.mockRejectedValue(new Error("database unavailable"));

  await expect(addTournamentMatches("2026test")).resolves.toBeUndefined();

  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
});

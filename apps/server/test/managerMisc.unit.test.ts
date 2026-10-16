import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@lovat/db";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  scoutReport: { update: vi.fn() },
  invalidate: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: db.invalidate }));
import { updateNotes } from "../src/handler/manager/updateNotes.js";
import { addNotOnTeam } from "../src/handler/manager/temp/addNotOnTeam.js";
import { getVersion } from "../src/handler/manager/version.js";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.scoutReport.update.mockResolvedValue({
    teamMatchData: { teamNumber: 254, tournamentKey: "2026test" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("updates only the lead's source-team report and invalidates analysis", async () => {
  expect(
    (
      await invoke(updateNotes, {
        body: { note: "Changed" },
        params: { uuid: "report" },
      })
    ).statusCode,
  ).toBe(200);
  expect(db.scoutReport.update).toHaveBeenCalledWith({
    where: { uuid: "report", scouter: { sourceTeamNumber: 8033 } },
    data: { notes: "Changed" },
    include: { teamMatchData: true },
  });
  expect(db.invalidate).toHaveBeenCalledWith(254, "2026test");
});
it.each([{ role: "ANALYST" as const }, { teamNumber: null }])(
  "denies note editing without team leadership (%j)",
  async (overrides) => {
    expect(
      (
        await invoke(updateNotes, {
          body: { note: "Changed" },
          params: { uuid: "report" },
          user: { ...testUser, ...overrides },
        })
      ).statusCode,
    ).toBe(403);
    expect(db.scoutReport.update).not.toHaveBeenCalled();
  },
);
it("validates notes before writing", async () => {
  expect(
    (
      await invoke(updateNotes, {
        body: { note: 123 },
        params: { uuid: "report" },
      })
    ).statusCode,
  ).toBe(400);
  expect(db.scoutReport.update).not.toHaveBeenCalled();
});
it("reports missing or inaccessible reports", async () => {
  db.scoutReport.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "test",
    }),
  );
  expect(
    (
      await invoke(updateNotes, {
        body: { note: "Changed" },
        params: { uuid: "report" },
      })
    ).statusCode,
  ).toBe(404);
});
it("reports failed invalidation", async () => {
  db.invalidate.mockRejectedValue(new Error("offline"));
  expect(
    (
      await invoke(updateNotes, {
        body: { note: "Changed" },
        params: { uuid: "report" },
      })
    ).statusCode,
  ).toBe(500);
});
for (const handler of [updateNotes, addNotOnTeam])
  it(`${handler.name} denies API keys`, async () => {
    expect((await invoke(handler, { tokenType: "apiKey" })).statusCode).toBe(
      403,
    );
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.scoutReport.update).not.toHaveBeenCalled();
  });
it("leaves a team and resets leadership", async () => {
  db.user.update.mockResolvedValue({
    ...testUser,
    teamNumber: null,
    role: "ANALYST",
  });
  const result = await invoke(addNotOnTeam);
  expect(result.statusCode).toBe(200);
  expect(db.user.update).toHaveBeenCalledWith({
    where: { id: testUser.id },
    data: { teamNumber: null, role: "ANALYST" },
  });
  expect(result.body).toEqual({
    ...testUser,
    teamNumber: null,
    role: "ANALYST",
  });
});
it("reports failed team departure", async () => {
  db.user.update.mockRejectedValue(new Error("offline"));
  expect((await invoke(addNotOnTeam)).statusCode).toBe(500);
});
it.each([undefined, "synthetic-commit"])(
  "returns server version and deployment commit (%s)",
  async (commit) => {
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", commit);
    expect((await invoke(getVersion)).body).toEqual({
      version: "26.0.0",
      gitCommit: commit ?? "no commit id",
    });
  },
);

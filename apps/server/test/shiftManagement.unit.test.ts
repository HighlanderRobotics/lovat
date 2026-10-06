import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  scouterScheduleShift: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  unique: vi.fn(),
  overlap: vi.fn(),
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/handler/manager/checkOnlyInstanceOfScouter.js", () => ({
  checkOnlyOneInstanceOfScouter: db.unique,
}));
vi.mock(
  "../src/handler/manager/scoutershifts/checkScouterShiftMatches.js",
  () => ({ checkScouterShiftMatches: db.overlap }),
);
import { addScouterShift } from "../src/handler/manager/tournament/addScouterShift.js";
import { updateScouterShift } from "../src/handler/manager/scoutershifts/updateScouterShift.js";
import { deleteScouterShift } from "../src/handler/manager/scoutershifts/deleteScouterShift.js";
const body = {
  startMatchOrdinalNumber: 1,
  endMatchOrdinalNumber: 10,
  team1: ["s1"],
  team2: ["s2"],
  team3: ["s3"],
  team4: ["s4"],
  team5: ["s5"],
  team6: ["s6"],
};
const params = { tournament: "2026test", uuid: "shift" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.unique.mockResolvedValue(true);
  db.overlap.mockResolvedValue(true);
  db.scouterScheduleShift.findUnique.mockResolvedValue({
    uuid: "shift",
    sourceTeamNumber: 8033,
    tournamentKey: "2026test",
  });
  db.scouterScheduleShift.update.mockResolvedValue({ uuid: "shift" });
});
afterEach(() => vi.restoreAllMocks());
for (const handler of [
  addScouterShift,
  updateScouterShift,
  deleteScouterShift,
]) {
  it(`${handler.name} rejects API keys`, async () => {
    expect((await invoke(handler, { tokenType: "apiKey" })).statusCode).toBe(
      403,
    );
    expect(db.scouterScheduleShift.findUnique).not.toHaveBeenCalled();
  });
  it(`${handler.name} validates input`, async () => {
    expect((await invoke(handler)).statusCode).toBe(400);
    expect(db.scouterScheduleShift.create).not.toHaveBeenCalled();
    expect(db.scouterScheduleShift.update).not.toHaveBeenCalled();
    expect(db.scouterScheduleShift.delete).not.toHaveBeenCalled();
  });
  it(`${handler.name} reports database failure`, async () => {
    db.scouterScheduleShift.findUnique.mockRejectedValue(new Error("offline"));
    db.scouterScheduleShift.create.mockRejectedValue(new Error("offline"));
    expect((await invoke(handler, { body, params })).statusCode).toBe(500);
  });
}
for (const handler of [addScouterShift, updateScouterShift]) {
  it(`${handler.name} rejects duplicate scouters`, async () => {
    db.unique.mockResolvedValue(false);
    expect((await invoke(handler, { body, params })).statusCode).toBe(400);
    expect(db.overlap).not.toHaveBeenCalled();
  });
  it(`${handler.name} rejects overlapping match ranges`, async () => {
    db.overlap.mockResolvedValue(false);
    expect((await invoke(handler, { body, params })).statusCode).toBe(400);
    expect(db.scouterScheduleShift.create).not.toHaveBeenCalled();
    expect(db.scouterScheduleShift.update).not.toHaveBeenCalled();
  });
  it(`${handler.name} requires leadership`, async () => {
    expect(
      (
        await invoke(handler, {
          body,
          params,
          user: { ...testUser, role: "ANALYST" },
        })
      ).statusCode,
    ).toBe(403);
    expect(db.scouterScheduleShift.create).not.toHaveBeenCalled();
    expect(db.scouterScheduleShift.update).not.toHaveBeenCalled();
  });
  it(`${handler.name} connects the six slot assignments`, async () => {
    expect((await invoke(handler, { body, params })).statusCode).toBe(200);
    const data = {
      startMatchOrdinalNumber: 1,
      endMatchOrdinalNumber: 10,
      sourceTeamNumber: 8033,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((i) => [
          `team${i}`,
          {
            ...(handler === updateScouterShift ? { set: [] } : {}),
            connect: [{ uuid: `s${i}` }],
          },
        ]),
      ),
    };
    if (handler === addScouterShift)
      expect(db.scouterScheduleShift.create).toHaveBeenCalledWith({
        data: { ...data, tournamentKey: "2026test" },
      });
    else
      expect(db.scouterScheduleShift.update).toHaveBeenCalledWith({
        where: { uuid: "shift", sourceTeamNumber: 8033 },
        data,
      });
  });
}
for (const handler of [updateScouterShift, deleteScouterShift]) {
  it(`${handler.name} returns missing shift`, async () => {
    db.scouterScheduleShift.findUnique.mockResolvedValue(null);
    expect((await invoke(handler, { body, params })).statusCode).toBe(404);
  });
  it(`${handler.name} denies another team's shift`, async () => {
    db.scouterScheduleShift.findUnique.mockResolvedValue({
      sourceTeamNumber: 254,
      tournamentKey: "2026test",
    });
    expect((await invoke(handler, { body, params })).statusCode).toBe(403);
    expect(db.scouterScheduleShift.update).not.toHaveBeenCalled();
    expect(db.scouterScheduleShift.delete).not.toHaveBeenCalled();
  });
}
it("denies teamless shift updates", async () => {
  expect(
    (
      await invoke(updateScouterShift, {
        body,
        params,
        user: { ...testUser, teamNumber: null },
      })
    ).statusCode,
  ).toBe(403);
});
it("returns a missing shift when the update has no result", async () => {
  db.scouterScheduleShift.update.mockResolvedValue(null);
  expect((await invoke(updateScouterShift, { body, params })).statusCode).toBe(
    404,
  );
});
it("deletes only the caller's team shift", async () => {
  expect((await invoke(deleteScouterShift, { params })).statusCode).toBe(200);
  expect(db.scouterScheduleShift.delete).toHaveBeenCalledWith({
    where: { uuid: "shift" },
  });
});

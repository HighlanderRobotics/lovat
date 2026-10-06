import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, testUser } from "./helpers/handlerHarness.js";

const db = vi.hoisted(() => ({
  scouter: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
  registeredTeam: { findUnique: vi.fn() },
  scouterScheduleShift: { findMany: vi.fn(), update: vi.fn() },
}));
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("../src/prismaClient.js", () => ({ default: db }));
vi.mock("../src/lib/clearCache.js", () => ({ invalidateCache: invalidate }));
const { addNewScouter } =
  await import("../src/handler/manager/scouters/addNewScouter.js");
const { addScouterDashboard } =
  await import("../src/handler/manager/scouters/addScouterDashboard.js");
const { archiveScouter } =
  await import("../src/handler/manager/scouters/archiveScouter.js");
const { unarchiveScouter } =
  await import("../src/handler/manager/scouters/unarchiveScouter.js");
const { changeNameScouter } =
  await import("../src/handler/manager/scouters/changeNameScouter.js");
const { updateScouterName } =
  await import("../src/handler/manager/scouters/updateScouterName.js");
const { deleteScouter } =
  await import("../src/handler/manager/scouters/deleteScouter.js");
const { checkCodeScouter } =
  await import("../src/handler/manager/scouters/checkCodeScouter.js");
const { getScouters } =
  await import("../src/handler/manager/scouters/getScouters.js");
const { getScoutersOnTeam } =
  await import("../src/handler/manager/scouters/getScoutersOnTeam.js");
const scouter = {
  uuid: "scouter-1",
  name: "New scouter",
  sourceTeamNumber: 8033,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.scouter.findUnique.mockResolvedValue(scouter);
  db.scouter.create.mockResolvedValue(scouter);
  db.scouter.update.mockResolvedValue(scouter);
  db.scouter.findMany.mockResolvedValue([scouter]);
  db.registeredTeam.findUnique.mockResolvedValue({
    number: 8033,
    code: "team-code",
  });
  db.scouterScheduleShift.findMany.mockResolvedValue([]);
  db.scouter.delete.mockResolvedValue({ ...scouter, scoutReports: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("scouter creation", () => {
  it("creates a Collection scouter for its submitted team", async () => {
    const response = await invoke(addNewScouter, {
      body: { teamNumber: 8033, name: "New scouter" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(scouter);
    expect(db.scouter.create).toHaveBeenCalledWith({
      data: { name: "New scouter", sourceTeamNumber: 8033 },
    });
  });
  it("creates a Dashboard scouter on the authenticated lead's team", async () => {
    const response = await invoke(addScouterDashboard, {
      body: { name: "New scouter", teamNumber: 254 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual(scouter);
    expect(db.scouter.create).toHaveBeenCalledWith({
      data: { name: "New scouter", sourceTeamNumber: 8033 },
    });
  });
  for (const handler of [addNewScouter, addScouterDashboard]) {
    it(`${handler.name} rejects invalid names before creating a row`, async () => {
      expect((await invoke(handler, { body: { name: 123 } })).statusCode).toBe(
        400,
      );
      expect(db.scouter.create).not.toHaveBeenCalled();
    });
    it(`${handler.name} returns a failure if the database write fails`, async () => {
      db.scouter.create.mockRejectedValue(new Error("offline"));
      expect(
        (
          await invoke(handler, {
            body: { name: "New scouter", teamNumber: 8033 },
          })
        ).statusCode,
      ).toBe(500);
    });
  }
  it.each([{ role: "ANALYST" as const }, { teamNumber: null }])(
    "denies Dashboard creation without team leadership (%j)",
    async (overrides) => {
      expect(
        (
          await invoke(addScouterDashboard, {
            body: { name: "New scouter" },
            user: { ...testUser, ...overrides },
          })
        ).statusCode,
      ).toBe(403);
      expect(db.scouter.create).not.toHaveBeenCalled();
    },
  );
  it("denies Dashboard creation with an API key", async () => {
    expect(
      (await invoke(addScouterDashboard, { tokenType: "apiKey" })).statusCode,
    ).toBe(403);
    expect(db.scouter.create).not.toHaveBeenCalled();
  });
});

for (const [handler, archived] of [
  [archiveScouter, true],
  [unarchiveScouter, false],
] as const) {
  describe(handler.name, () => {
    it("changes only the requested scouter on the authenticated lead's team", async () => {
      expect(
        (await invoke(handler, { params: { uuid: scouter.uuid } })).statusCode,
      ).toBe(200);
      expect(db.scouter.update).toHaveBeenCalledWith({
        where: { uuid: scouter.uuid, sourceTeamNumber: 8033 },
        data: { archived },
      });
    });
    it("requires a scouter identifier", async () => {
      expect((await invoke(handler)).statusCode).toBe(400);
      expect(db.scouter.update).not.toHaveBeenCalled();
    });
    it.each([{ role: "ANALYST" as const }, { teamNumber: null }])(
      "denies callers without team leadership (%j)",
      async (overrides) => {
        expect(
          (
            await invoke(handler, {
              params: { uuid: scouter.uuid },
              user: { ...testUser, ...overrides },
            })
          ).statusCode,
        ).toBe(403);
        expect(db.scouter.update).not.toHaveBeenCalled();
      },
    );
    it("denies API key mutations", async () => {
      expect((await invoke(handler, { tokenType: "apiKey" })).statusCode).toBe(
        403,
      );
      expect(db.scouter.update).not.toHaveBeenCalled();
    });
    it("returns a server error when the database is unavailable", async () => {
      db.scouter.update.mockRejectedValue(new Error("offline"));
      expect(
        (await invoke(handler, { params: { uuid: scouter.uuid } })).statusCode,
      ).toBe(500);
    });
  });
}

describe("renaming scouters", () => {
  it("updates a Collection name by its scouter identifier", async () => {
    expect(
      (
        await invoke(changeNameScouter, {
          params: { uuid: scouter.uuid },
          body: { name: "Changed" },
        })
      ).statusCode,
    ).toBe(200);
    expect(db.scouter.update).toHaveBeenCalledWith({
      where: { uuid: scouter.uuid },
      data: { name: "Changed" },
    });
  });
  it("rejects missing Collection input", async () => {
    expect((await invoke(changeNameScouter)).statusCode).toBe(400);
    expect(db.scouter.update).not.toHaveBeenCalled();
  });
  it("reports Collection database errors", async () => {
    db.scouter.update.mockRejectedValue(new Error("offline"));
    expect(
      (
        await invoke(changeNameScouter, {
          params: { uuid: scouter.uuid },
          body: { name: "Changed" },
        })
      ).statusCode,
    ).toBe(500);
  });
});

for (const handler of [updateScouterName, deleteScouter]) {
  describe(handler.name, () => {
    const body = { scouterUuid: scouter.uuid, newName: "Changed" };
    it("requires JWT authorization", async () => {
      expect(
        (await invoke(handler, { body, tokenType: "apiKey" })).statusCode,
      ).toBe(403);
      expect(db.scouter.findUnique).not.toHaveBeenCalled();
    });
    it("validates its input before looking up a scouter", async () => {
      expect((await invoke(handler)).statusCode).toBe(400);
      expect(db.scouter.findUnique).not.toHaveBeenCalled();
    });
    it("denies users with no team", async () => {
      expect(
        (
          await invoke(handler, {
            body,
            user: { ...testUser, teamNumber: null },
          })
        ).statusCode,
      ).toBe(404);
      expect(db.scouter.findUnique).not.toHaveBeenCalled();
    });
    it("reports an unknown scouter", async () => {
      db.scouter.findUnique.mockResolvedValue(null);
      expect((await invoke(handler, { body })).statusCode).toBe(404);
      expect(db.scouter.update).not.toHaveBeenCalled();
      expect(db.scouter.delete).not.toHaveBeenCalled();
    });
    it.each([{ role: "ANALYST" as const }, { teamNumber: 254 }])(
      "rejects callers without ownership and leadership (%j)",
      async (overrides) => {
        expect(
          (await invoke(handler, { body, user: { ...testUser, ...overrides } }))
            .statusCode,
        ).toBe(403);
        expect(db.scouter.update).not.toHaveBeenCalled();
        expect(db.scouter.delete).not.toHaveBeenCalled();
      },
    );
    it("reports failed database reads", async () => {
      db.scouter.findUnique.mockRejectedValue(new Error("offline"));
      expect((await invoke(handler, { body })).statusCode).toBe(500);
    });
    it("allows the owning scouting lead", async () => {
      expect((await invoke(handler, { body })).statusCode).toBe(200);
      if (handler === updateScouterName)
        expect(db.scouter.update).toHaveBeenCalledWith({
          where: { uuid: scouter.uuid },
          data: { name: "Changed" },
        });
      else {
        expect(db.scouter.delete).toHaveBeenCalledWith(
          expect.objectContaining({ where: { uuid: scouter.uuid } }),
        );
        expect(invalidate).toHaveBeenCalledWith([], []);
      }
    });
  });
}

it("disconnects deleted scouters from shifts and invalidates their report dependencies", async () => {
  db.scouter.delete.mockResolvedValue({
    ...scouter,
    scoutReports: [
      { teamMatchData: { teamNumber: 254, tournamentKey: "2026test" } },
    ],
  });
  const shift = {
    uuid: "shift-1",
    team1: [scouter],
    team2: [],
    team3: [],
    team4: [],
    team5: [],
    team6: [],
  };
  db.scouterScheduleShift.findMany.mockResolvedValue([
    shift,
    { ...shift, uuid: "empty", team1: [] },
  ]);
  expect(
    (await invoke(deleteScouter, { body: { scouterUuid: scouter.uuid } }))
      .statusCode,
  ).toBe(200);
  expect(db.scouterScheduleShift.update).toHaveBeenCalledOnce();
  expect(db.scouterScheduleShift.update).toHaveBeenCalledWith({
    where: { uuid: "shift-1" },
    data: { team1: { disconnect: [{ uuid: scouter.uuid }] } },
  });
  expect(invalidate).toHaveBeenCalledWith([254], ["2026test"]);
});

describe("scouter discovery", () => {
  it.each([undefined, "true", "false"])(
    "filters the authenticated team by archived state (%s)",
    async (archived) => {
      const query = archived === undefined ? {} : { archived };
      const response = await invoke(getScouters, { query });
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual([scouter]);
      expect(db.scouter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceTeamNumber: 8033,
            archived: archived === undefined ? undefined : archived === "true",
          },
        }),
      );
    },
  );
  it("denies teamless discovery", async () => {
    expect(
      (await invoke(getScouters, { user: { ...testUser, teamNumber: null } }))
        .statusCode,
    ).toBe(403);
    expect(db.scouter.findMany).not.toHaveBeenCalled();
  });
  it("reports invalid archived queries", async () => {
    expect(
      (await invoke(getScouters, { query: { archived: ["true", "false"] } }))
        .statusCode,
    ).toBe(500);
    expect(db.scouter.findMany).not.toHaveBeenCalled();
  });
  it("reports discovery database failures", async () => {
    db.scouter.findMany.mockRejectedValue(new Error("offline"));
    expect((await invoke(getScouters)).statusCode).toBe(500);
  });
  it("validates Collection team codes", async () => {
    expect(
      (await invoke(checkCodeScouter, { query: { code: "team-code" } })).body,
    ).toEqual({ number: 8033, code: "team-code" });
    expect(db.registeredTeam.findUnique).toHaveBeenCalledWith({
      where: { code: "team-code" },
    });
    db.registeredTeam.findUnique.mockResolvedValue(null);
    expect(
      (await invoke(checkCodeScouter, { query: { code: "unknown" } })).body,
    ).toBe(false);
  });
  it("lists only unarchived scouters for a valid Collection team code", async () => {
    const response = await invoke(getScoutersOnTeam, {
      headers: { "x-team-code": "team-code" },
    });
    expect(response.body).toEqual([scouter]);
    expect(db.scouter.findMany).toHaveBeenCalledWith({
      where: { sourceTeamNumber: 8033, archived: false },
    });
    db.registeredTeam.findUnique.mockResolvedValue(null);
    expect(
      (
        await invoke(getScoutersOnTeam, {
          headers: { "x-team-code": "unknown" },
        })
      ).statusCode,
    ).toBe(404);
  });
  for (const handler of [checkCodeScouter, getScoutersOnTeam]) {
    it(`${handler.name} validates missing team codes`, async () => {
      expect((await invoke(handler)).statusCode).toBe(400);
      expect(db.registeredTeam.findUnique).not.toHaveBeenCalled();
    });
    it(`${handler.name} reports unavailable team-code lookup`, async () => {
      db.registeredTeam.findUnique.mockRejectedValue(new Error("offline"));
      expect(
        (
          await invoke(handler, {
            query: { code: "team-code" },
            headers: { "x-team-code": "team-code" },
          })
        ).statusCode,
      ).toBe(500);
    });
  }
});

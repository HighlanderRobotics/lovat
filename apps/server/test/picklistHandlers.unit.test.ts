import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@lovat/db";
import { invoke, testUser } from "./helpers/handlerHarness.js";
const db = vi.hoisted(() => ({
  sharedPicklist: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mutablePicklist: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../src/prismaClient.js", () => ({ default: db }));
import { addPicklist } from "../src/handler/manager/picklists/addPicklist.js";
import { getPicklists } from "../src/handler/manager/picklists/getPicklists.js";
import { getSinglePicklist } from "../src/handler/manager/picklists/getSinglePicklist.js";
import { updatePicklist } from "../src/handler/manager/picklists/updatePicklist.js";
import { deletePicklist } from "../src/handler/manager/picklists/deletePicklist.js";
import { addMutablePicklist } from "../src/handler/manager/mutablepicklists/addMutablePicklist.js";
import { getMutablePicklists } from "../src/handler/manager/mutablepicklists/getMutablePicklists.js";
import { getSingleMutablePicklist } from "../src/handler/manager/mutablepicklists/getSingleMutablePicklist.js";
import { updateMutablePicklist } from "../src/handler/manager/mutablepicklists/updateMutablePicklist.js";
import { deleteMutablePicklist } from "../src/handler/manager/mutablepicklists/deleteMutablePicklist.js";
const weightedBody = Object.fromEntries(
  [
    "totalPoints",
    "autoPoints",
    "teleopPoints",
    "driverAbility",
    "climbResult",
    "autoClimb",
    "defenseEffectiveness",
    "contactDefenseTime",
    "campingDefenseTime",
    "totalDefensiveTime",
    "totalFuelThroughput",
    "totalFuelFed",
    "feedingRate",
    "scoringRate",
    "estimatedSuccessfulFuelRate",
    "estimatedTotalFuelScored",
  ].map((metric, i) => [metric, i + 1]),
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const model of Object.values(db)) {
    model.findMany.mockResolvedValue([{ uuid: "list", name: "Synthetic" }]);
    model.findUnique.mockResolvedValue({
      uuid: "list",
      name: "Synthetic",
      author: testUser,
      authorId: testUser.id,
      ...weightedBody,
    });
    model.update.mockResolvedValue({ uuid: "list" });
  }
});
afterEach(() => vi.restoreAllMocks());
for (const [kind, model, add, list, detail, update, remove, body] of [
  [
    "shared",
    db.sharedPicklist,
    addPicklist,
    getPicklists,
    getSinglePicklist,
    updatePicklist,
    deletePicklist,
    { name: "Synthetic", ...weightedBody },
  ],
  [
    "mutable",
    db.mutablePicklist,
    addMutablePicklist,
    getMutablePicklists,
    getSingleMutablePicklist,
    updateMutablePicklist,
    deleteMutablePicklist,
    { name: "Synthetic", teams: [254, 971], tournamentKey: "2026test" },
  ],
] as const) {
  it(`${kind} creates using the authenticated author and the supplied values`, async () => {
    expect(
      (await invoke(add, { body: { ...body, authorId: "spoof" } })).statusCode,
    ).toBe(200);
    expect(model.create).toHaveBeenCalledWith({
      data: { ...body, authorId: testUser.id },
    });
  });
  it(`${kind} reports creation failures`, async () => {
    model.create.mockRejectedValue(new Error("database"));
    expect((await invoke(add, { body })).statusCode).toBe(500);
  });
  it(`${kind} rejects malformed creation requests`, async () => {
    expect((await invoke(add)).statusCode).toBe(400);
  });
  it(`${kind} denies teamless publishing`, async () => {
    expect(
      (await invoke(add, { body, user: { ...testUser, teamNumber: null } }))
        .statusCode,
    ).toBe(403);
    expect(model.create).not.toHaveBeenCalled();
  });
  it(`${kind} lists only the authenticated team's picklists`, async () => {
    expect((await invoke(list)).body).toEqual([
      { uuid: "list", name: "Synthetic" },
    ]);
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { author: { teamNumber: 8033 } } }),
    );
  });
  it(`${kind} denies teamless listing`, async () => {
    expect(
      (await invoke(list, { user: { ...testUser, teamNumber: null } }))
        .statusCode,
    ).toBe(403);
    expect(model.findMany).not.toHaveBeenCalled();
  });
  it(`${kind} reports listing failures`, async () => {
    model.findMany.mockRejectedValue(new Error("database"));
    expect((await invoke(list)).statusCode).toBe(500);
  });
  it(`${kind} reports detail lookup failures`, async () => {
    model.findUnique.mockRejectedValue(new Error("database"));
    expect(
      (await invoke(detail, { params: { uuid: "list" } })).statusCode,
    ).toBe(500);
  });
  it(`${kind} validates detail identifiers`, async () => {
    expect((await invoke(detail)).statusCode).toBe(400);
  });
  it(`${kind} returns not found for absent detail rows`, async () => {
    model.findUnique.mockResolvedValue(null);
    expect(
      (await invoke(detail, { params: { uuid: "list" } })).statusCode,
    ).toBe(404);
  });
  it(`${kind} updates team-scoped rows using the authenticated author`, async () => {
    expect(
      (await invoke(update, { params: { uuid: "list" }, body })).statusCode,
    ).toBe(200);
    const updatedBody = { ...body } as Record<string, unknown>;
    delete updatedBody.tournamentKey;
    expect(model.update).toHaveBeenCalledWith({
      where: { uuid: "list", author: { teamNumber: 8033 } },
      data: { ...updatedBody, authorId: testUser.id },
    });
  });
  it(`${kind} validates update payloads`, async () => {
    expect(
      (await invoke(update, { params: { uuid: "list" } })).statusCode,
    ).toBe(400);
  });
  it.each(["P2025", "P2002"])(
    `${kind} translates failed updates %s`,
    async (code) => {
      model.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("synthetic", {
          code,
          clientVersion: "test",
        }),
      );
      expect(
        (await invoke(update, { params: { uuid: "list" }, body })).statusCode,
      ).toBe(code === "P2025" ? 404 : 500);
    },
  );
  it(`${kind} reports unexpected update failures`, async () => {
    model.update.mockRejectedValue(new Error("database"));
    expect(
      (await invoke(update, { params: { uuid: "list" }, body })).statusCode,
    ).toBe(500);
  });
  it(`${kind} deletes a teammate's picklist`, async () => {
    expect(
      (await invoke(remove, { params: { uuid: "list" } })).statusCode,
    ).toBe(200);
    expect(model.delete).toHaveBeenCalledWith({ where: { uuid: "list" } });
  });
  it(`${kind} validates deletion identifiers`, async () => {
    expect((await invoke(remove)).statusCode).toBe(400);
  });
  it(`${kind} rejects missing deletion targets`, async () => {
    model.findUnique.mockResolvedValue(null);
    expect(
      (await invoke(remove, { params: { uuid: "list" } })).statusCode,
    ).toBe(404);
  });
  it.each([971, null])(
    `${kind} blocks deletion outside a non-null team (%s)`,
    async (teamNumber) => {
      model.findUnique.mockResolvedValue({ author: { teamNumber } });
      const user =
        teamNumber === null ? { ...testUser, teamNumber: null } : testUser;
      expect(
        (await invoke(remove, { params: { uuid: "list" }, user })).statusCode,
      ).toBe(403);
      expect(model.delete).not.toHaveBeenCalled();
    },
  );
  it(`${kind} reports deletion failures`, async () => {
    model.delete.mockRejectedValue(new Error("database"));
    expect(
      (await invoke(remove, { params: { uuid: "list" } })).statusCode,
    ).toBe(500);
  });
  for (const handler of [add, update, remove]) {
    it(`${kind} blocks API tokens on ${handler.name}`, async () => {
      expect(
        (
          await invoke(handler, {
            tokenType: "apiKey",
            params: { uuid: "list" },
            body,
          })
        ).statusCode,
      ).toBe(403);
    });
  }
  for (const handler of [detail, update]) {
    it(`${kind} denies teamless ${handler.name}`, async () => {
      expect(
        (
          await invoke(handler, {
            user: { ...testUser, teamNumber: null },
            params: { uuid: "list" },
            body,
          })
        ).statusCode,
      ).toBe(403);
      expect(model.findUnique).not.toHaveBeenCalled();
      expect(model.update).not.toHaveBeenCalled();
    });
  }
}
it("defaults omitted shared weights to zero", async () => {
  await invoke(addPicklist, { body: { name: "Defaults" } });
  await invoke(updatePicklist, {
    params: { uuid: "list" },
    body: { name: "Defaults" },
  });
  expect(db.sharedPicklist.create).toHaveBeenCalledWith({
    data: {
      name: "Defaults",
      authorId: testUser.id,
      ...Object.fromEntries(Object.keys(weightedBody).map((key) => [key, 0])),
    },
  });
});
it.each([getSinglePicklist, getSingleMutablePicklist])(
  "%s returns the requested team-scoped detail",
  async (handler) => {
    const result = await invoke(handler, { params: { uuid: "list" } });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      uuid: "list",
      name: "Synthetic",
      authorId: testUser.id,
    });
    expect(
      handler === getSinglePicklist
        ? db.sharedPicklist.findUnique
        : db.mutablePicklist.findUnique,
    ).toHaveBeenCalledWith({
      where: { uuid: "list", author: { teamNumber: 8033 } },
    });
  },
);

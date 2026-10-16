import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";
import { testUser } from "./helpers/handlerHarness.js";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("../src/prismaClient.js", () => ({
  default: { scouterScheduleShift: { findMany } },
}));
import { checkScouterShiftMatches } from "../src/handler/manager/scoutershifts/checkScouterShiftMatches.js";
const req = { user: testUser } as AuthenticatedRequest;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it.each([
  { shifts: [], start: 1, end: 10, expected: true },
  { shifts: [[10, 20]], start: 1, end: 9, expected: true },
  { shifts: [[10, 20]], start: 21, end: 30, expected: true },
  { shifts: [[10, 20]], start: 10, end: 20, expected: false },
  { shifts: [[10, 20]], start: 5, end: 10, expected: false },
  { shifts: [[10, 20]], start: 20, end: 25, expected: false },
  {
    shifts: [
      [10, 20],
      [30, 40],
    ],
    start: 21,
    end: 29,
    expected: true,
  },
  {
    shifts: [
      [10, 20],
      [30, 40],
    ],
    start: 21,
    end: 30,
    expected: false,
  },
  {
    shifts: [
      [10, 20],
      [30, 40],
    ],
    start: 5,
    end: 45,
    expected: false,
  },
  {
    shifts: [
      [10, 20],
      [30, 40],
    ],
    start: 41,
    end: 45,
    expected: true,
  },
])(
  "detects inclusive shift range conflicts ($start-$end, $shifts)",
  async ({ shifts, start, end, expected }) => {
    findMany.mockResolvedValue(
      shifts.map(([startMatchOrdinalNumber, endMatchOrdinalNumber]) => ({
        startMatchOrdinalNumber,
        endMatchOrdinalNumber,
      })),
    );
    expect(await checkScouterShiftMatches(req, "2026test", start, end)).toBe(
      expected,
    );
  },
);
it.each([null, "edited-shift"])(
  "scopes shifts to team and excludes the edited shift (%s)",
  async (uuid) => {
    findMany.mockResolvedValue([]);
    await checkScouterShiftMatches(req, "2026test", 1, 10, uuid);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tournamentKey: "2026test",
        sourceTeamNumber: 8033,
        ...(uuid ? { uuid: { not: uuid } } : {}),
      },
      orderBy: { startMatchOrdinalNumber: "asc" },
    });
  },
);
it("propagates lookup failures", async () => {
  findMany.mockRejectedValue(new Error("offline"));
  await expect(
    checkScouterShiftMatches(req, "2026test", 1, 10),
  ).rejects.toThrow("offline");
});

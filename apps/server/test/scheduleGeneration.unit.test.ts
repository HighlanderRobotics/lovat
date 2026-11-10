import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";
const mocks = vi.hoisted(() => ({
  http: vi.fn(),
  isAxiosError: vi.fn(),
  fetch: vi.fn(),
  tournament: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("axios", () => ({
  default: { get: mocks.http, isAxiosError: mocks.isAxiosError },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { tournament: mocks.tournament },
}));
import {
  generateSchedule,
  superScoutingSchedule,
} from "../src/handler/manager/scoutershifts/generateSchedule.js";
const match = (number: number) => ({
  match_number: number,
  comp_level: "qm",
  time:
    1773316800 +
    number * 600 +
    (number > 12 ? 2000 : 0) +
    (number === 26 ? 80000 : 0),
  alliances: {
    red: { team_keys: ["frc1B", "frc2", "frc3"] },
    blue: { team_keys: ["frc4", "frc5", "frc6"] },
  },
});
let matches: ReturnType<typeof match>[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.tournament.findUnique.mockResolvedValue({ key: "2026test" });
  mocks.fetch.mockResolvedValue({
    json: async () => ({ remap_teams: { frc1B: "frc1" } }),
  });
  matches = Array.from({ length: 26 }, (_, i) => match(i + 1)).reverse();
  mocks.http.mockImplementation(async (url) => ({
    data: url.endsWith("/matches")
      ? matches
      : [1, 2, 3, 4, 5].map((team_number) => ({ team_number })),
    headers: { etag: "synthetic-etag" },
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("balances three scouters across qualification teams and emits shift and lunch breaks", async () => {
  const csv = await generateSchedule("2026test");
  const rows = csv!.split("\n");
  expect(rows[0]).toBe(
    "Match Number,Scouter 1,Team,Scouter 2,Team,Scouter 3,Team,Expected Time",
  );
  expect(rows).toContain("SHIFT CHANGE,,,,,,,");
  expect(rows).toContain("LUNCH,,,,,,,");
  expect(rows.at(-1)).toBe("EOD,,,,,,,");
  expect(rows.some((row) => row.startsWith("25,"))).toBe(true);
  expect(rows.some((row) => row.startsWith("26,"))).toBe(false);
  expect(rows.find((row) => row.startsWith("1,"))).toContain(
    "Christian,2,Oren,3,Ben,1",
  );
  expect(mocks.tournament.update).toHaveBeenCalledWith({
    where: { key: "2026test" },
    data: { latestFetchETag: "synthetic-etag" },
  });
});
it("supports custom scouter groups for a single-day event", async () => {
  matches = [
    {
      ...match(2),
      alliances: {
        red: { team_keys: ["frc1", "frc2", "frc3"] },
        blue: { team_keys: ["frc4", "frc5", "frc6"] },
      },
    },
    {
      ...match(1),
      alliances: {
        red: { team_keys: ["frc1", "frc2", "frc3"] },
        blue: { team_keys: ["frc4", "frc5", "frc6"] },
      },
    },
  ];
  mocks.fetch.mockResolvedValue({ json: async () => ({ remap_teams: null }) });
  const csv = await generateSchedule("2026test", [["A", "B", "C"]]);
  expect(csv).toContain("1,A,2,B,3,C,1,");
  expect(csv).toContain("2,A,6,B,4,C,5,");
});
it("ignores elimination matches in the generated scouting schedule", async () => {
  matches = [{ ...match(1), comp_level: "sf" }, match(2), match(3)];
  const csv = await generateSchedule("2026test");
  expect(csv).not.toMatch(/^1,/m);
  expect(csv).toMatch(/^2,/m);
});
it("serves CSV through the HTTP handler", async () => {
  expect(
    (
      await invoke(superScoutingSchedule, {
        query: { tournamentKey: "2026test" },
      })
    ).statusCode,
  ).toBe(200);
});
it("validates a tournament key before fetching", async () => {
  expect((await invoke(superScoutingSchedule)).statusCode).toBe(400);
  expect(mocks.http).not.toHaveBeenCalled();
  await expect(generateSchedule(undefined as unknown as string)).rejects.toBe(
    "tournament key is undefined",
  );
});
it("reports unknown tournaments", async () => {
  mocks.tournament.findUnique.mockResolvedValue(null);
  expect(
    (
      await invoke(superScoutingSchedule, {
        query: { tournamentKey: "2026test" },
      })
    ).statusCode,
  ).toBe(500);
});
it.each([true, false])(
  "reports no qualification schedule (%s empty data)",
  async (empty) => {
    matches = empty ? [] : [{ ...match(1), comp_level: "sf" }];
    expect(
      (
        await invoke(superScoutingSchedule, {
          query: { tournamentKey: "2026test" },
        })
      ).statusCode,
    ).toBe(404);
  },
);
it("maps unchanged TBA responses to an unavailable schedule", async () => {
  mocks.isAxiosError.mockReturnValue(true);
  mocks.http.mockRejectedValue({ response: { status: 304 } });
  expect(
    (
      await invoke(superScoutingSchedule, {
        query: { tournamentKey: "2026test" },
      })
    ).statusCode,
  ).toBe(404);
});
it("reports external failures", async () => {
  mocks.http.mockRejectedValue(new Error("offline"));
  expect(
    (
      await invoke(superScoutingSchedule, {
        query: { tournamentKey: "2026test" },
      })
    ).statusCode,
  ).toBe(500);
});

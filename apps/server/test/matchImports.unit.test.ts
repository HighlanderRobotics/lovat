import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  http: vi.fn(),
  isAxiosError: vi.fn(),
  fetch: vi.fn(),
  tournament: { findUnique: vi.fn(), update: vi.fn() },
  teamMatchData: { upsert: vi.fn() },
}));
vi.mock("axios", () => ({
  default: { get: mocks.http, isAxiosError: mocks.isAxiosError },
}));
vi.mock("../src/prismaClient.js", () => ({
  default: { tournament: mocks.tournament, teamMatchData: mocks.teamMatchData },
}));
import { addTournamentMatches } from "../src/handler/manager/addTournamentMatches.js";
const match = (key = "2026test_qm1", level = "qm") => ({
  key,
  comp_level: level,
  match_number: 1,
  actual_time: 10,
  time: 20,
  alliances: {
    red: { team_keys: ["frc1B", "frc2", "frc3"] },
    blue: { team_keys: ["frc4", "frc5", "frc6"] },
  },
});
let matches: ReturnType<typeof match>[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mocks.tournament.findUnique.mockResolvedValue({
    latestFetchETag: "old-etag",
  });
  mocks.fetch.mockResolvedValue({
    json: async () => ({ remap_teams: { frc1: "frc1B" }, playoff_type: 10 }),
  });
  matches = [match()];
  mocks.http.mockImplementation(async () => ({
    data: matches,
    headers: { etag: "new-etag" },
  }));
  vi.stubEnv("TBA_KEY", "synthetic-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("remaps qualification teams and upserts all six positions with an ETag", async () => {
  await addTournamentMatches("2026test");
  expect(mocks.http).toHaveBeenCalledWith(
    "https://www.thebluealliance.com/api/v3/event/2026test/matches",
    {
      headers: {
        "X-TBA-Auth-Key": "synthetic-key",
        "If-None-Match": "old-etag",
      },
    },
  );
  expect(mocks.tournament.update).toHaveBeenCalledWith({
    where: { key: "2026test" },
    data: { latestFetchETag: "new-etag" },
  });
  expect(mocks.teamMatchData.upsert).toHaveBeenCalledTimes(6);
  expect(mocks.teamMatchData.upsert).toHaveBeenCalledWith({
    where: { key: "2026test_qm1_0" },
    update: {
      tournamentKey: "2026test",
      matchNumber: 1,
      teamNumber: 1,
      matchType: "QUALIFICATION",
    },
    create: {
      key: "2026test_qm1_0",
      tournamentKey: "2026test",
      matchNumber: 1,
      teamNumber: 1,
      matchType: "QUALIFICATION",
    },
  });
});
it.each([10, 11])(
  "maps playoff final ordinals for the event format (%s)",
  async (playoff_type) => {
    matches = [match("2026test_f1m1", "f")];
    mocks.fetch.mockResolvedValue({
      json: async () => ({ remap_teams: { frc1: "frc1B" }, playoff_type }),
    });
    await addTournamentMatches("2026test");
    const ordinal = playoff_type === 10 ? 14 : 6;
    expect(mocks.teamMatchData.upsert).toHaveBeenCalledWith({
      where: { key: `2026test_em${ordinal}_0` },
      update: {
        tournamentKey: "2026test",
        matchNumber: ordinal,
        teamNumber: 1,
        matchType: "ELIMINATION",
      },
      create: {
        key: `2026test_em${ordinal}_0`,
        tournamentKey: "2026test",
        matchNumber: ordinal,
        teamNumber: 1,
        matchType: "ELIMINATION",
      },
    });
  },
);
it.each([undefined, null])(
  "imports unmapped teams when remapping is absent (%s)",
  async (remap_teams) => {
    mocks.tournament.findUnique.mockResolvedValue({ latestFetchETag: null });
    vi.stubEnv("TBA_KEY", undefined);
    mocks.fetch.mockResolvedValue({
      json: async () => ({ remap_teams, playoff_type: 11 }),
    });
    matches = [
      {
        ...match(),
        actual_time: null as unknown as number,
        time: null as unknown as number,
        alliances: {
          red: { team_keys: ["frc1", "frc2", "frc3"] },
          blue: { team_keys: ["frc4", "frc5", "frc6"] },
        },
      },
      {
        ...match(),
        actual_time: null as unknown as number,
        time: 20,
        match_number: 2,
      },
    ];
    await addTournamentMatches("2026test");
    expect(mocks.teamMatchData.upsert).toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), {
      headers: { "X-TBA-Auth-Key": "" },
    });
  },
);
it.each(["frcBAD", "frc0", "frc-1"])(
  "skips playoffs with unknown or invalid teams (%s)",
  async (teamKey) => {
    matches = [
      {
        ...match("2026test_sf1m1", "sf"),
        alliances: {
          red: { team_keys: [teamKey, "frc2", "frc3"] },
          blue: { team_keys: ["frc4", "frc5", "frc6"] },
        },
      },
    ];
    await addTournamentMatches("2026test");
    expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
  },
);
it("skips incomplete alliances and unmapped playoff matches", async () => {
  matches = [
    {
      ...match("2026test_sf1m1", "sf"),
      alliances: { red: { team_keys: [] }, blue: { team_keys: [] } },
    },
    match("2026test_qf1m1", "qf"),
    match("missing-suffix", "sf"),
  ];
  await addTournamentMatches("2026test");
  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
});
it("stops invalid qualification imports before writing a bad team number", async () => {
  mocks.fetch.mockResolvedValue({ json: async () => ({}) });
  await addTournamentMatches("2026test");
  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
});
it("retains existing matches for HTTP 304 responses", async () => {
  mocks.isAxiosError.mockReturnValue(true);
  mocks.http.mockRejectedValue({ response: { status: 304 } });
  await addTournamentMatches("2026test");
  expect(mocks.tournament.update).not.toHaveBeenCalled();
  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
});
it.each([new Error("offline"), { response: { status: 500 } }, {}])(
  "does not write matches after failed TBA fetches (%j)",
  async (error) => {
    mocks.isAxiosError.mockReturnValue(true);
    mocks.http.mockRejectedValue(error);
    await addTournamentMatches("2026test");
    expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
  },
);
it("ignores other seasons without contacting TBA", async () => {
  await addTournamentMatches("2025test");
  expect(mocks.tournament.findUnique).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("handles undefined and unknown tournaments before fetching", async () => {
  await addTournamentMatches(undefined as unknown as string);
  mocks.tournament.findUnique.mockResolvedValue(null);
  await addTournamentMatches("2026test");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("rejects malformed playoff team numbers before upserting", async () => {
  mocks.fetch.mockResolvedValue({ json: async () => ({ playoff_type: 10 }) });
  matches = [
    {
      ...match("2026test_sf1", "sf"),
      alliances: {
        red: { team_keys: ["invalid", "frc2", "frc3"] },
        blue: { team_keys: ["frc4", "frc5", "frc6"] },
      },
    },
  ];
  await addTournamentMatches("2026test");
  expect(mocks.teamMatchData.upsert).not.toHaveBeenCalled();
});
it("sorts playoff matches with missing actual and scheduled timestamps", async () => {
  mocks.fetch.mockResolvedValue({
    json: async () => ({ playoff_type: 10, remap_teams: { frc1: "frc1B" } }),
  });
  matches = [match("2026test_sf1m1", "sf"), match("2026test_sf2m1", "sf")].map(
    (value) => ({
      ...value,
      actual_time: null as unknown as number,
      time: null as unknown as number,
    }),
  );
  await addTournamentMatches("2026test");
  expect(mocks.teamMatchData.upsert).toHaveBeenCalledTimes(12);
});

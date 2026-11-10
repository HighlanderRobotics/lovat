import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ upsert: vi.fn(), createTeams: vi.fn() }));

vi.mock("../src/prismaClient.js", () => ({
  default: {
    teamMatchData: { upsert: database.upsert },
    team: { createMany: database.createTeams },
  },
}));
vi.mock("../src/lib/fetchPracticeMatches.js", () => ({
  fetchPracticeMatches: vi.fn(),
}));

import { fetchPracticeMatches } from "../src/lib/fetchPracticeMatches.js";
import { addPracticeMatches } from "../src/handler/manager/addPracticeMatches.js";

describe("saving imported practice matches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses report-compatible keys and only marks existing rows as publicly scheduled", async () => {
    vi.mocked(fetchPracticeMatches).mockResolvedValue([
      { matchNumber: 4, teamNumbers: [8033, 254] },
    ]);

    await addPracticeMatches("2026test");
    await addPracticeMatches("2026test");

    expect(database.upsert).toHaveBeenCalledTimes(4);
    expect(database.createTeams).toHaveBeenCalledWith({
      data: [
        { number: 8033, name: "Team 8033" },
        { number: 254, name: "Team 254" },
      ],
      skipDuplicates: true,
    });
    for (const teamNumber of [8033, 254]) {
      const key = `2026test_pm4_${teamNumber}`;
      const expected = {
        where: { key },
        update: { practiceScheduled: true },
        create: {
          key,
          tournamentKey: "2026test",
          matchNumber: 4,
          teamNumber,
          matchType: "PRACTICE",
          practiceScheduled: true,
        },
      };
      expect(database.upsert).toHaveBeenCalledWith(expected);
      // Both imports must reuse the same identity without updating report relations.
      const callsForTeam = database.upsert.mock.calls.filter(
        ([args]) => args.where.key === key,
      );
      expect(callsForTeam).toEqual([[expected], [expected]]);
    }
  });

  it("does not write to the database when no practice schedule is available", async () => {
    vi.mocked(fetchPracticeMatches).mockResolvedValue([]);

    await addPracticeMatches("2026test");

    expect(database.upsert).not.toHaveBeenCalled();
    expect(database.createTeams).not.toHaveBeenCalled();
  });
});

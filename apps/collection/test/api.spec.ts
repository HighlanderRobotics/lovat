import { AllianceColor } from "../lib/models/AllianceColor";
import { MatchType } from "../lib/models/match";
import { get, post } from "../lib/lovatAPI/lovatAPI";
import { addScouter } from "../lib/lovatAPI/addScouter";
import { checkTeamCode } from "../lib/lovatAPI/checkTeamCode";
import { getTeamScouters } from "../lib/lovatAPI/getTeamScouters";
import { getTournaments } from "../lib/lovatAPI/getTournaments";
import {
  getScouterSchedule,
  getVerionsColor,
} from "../lib/lovatAPI/getScouterSchedule";
import { getMatchSchedule } from "../lib/lovatAPI/getMatchSchedule";
import { uploadReport } from "../lib/lovatAPI/uploadReport";
import { useScouterStore, useTournamentStore } from "../lib/storage/userStores";
import { useReportStateStore } from "../lib/collection/reportStateStore";

jest.mock("../lib/lovatAPI/lovatAPI", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
const getMock = jest.mocked(get),
  postMock = jest.mocked(post);
const response = (body: unknown, ok = true, statusText = "") =>
  ({
    ok,
    status: ok ? 200 : 503,
    statusText,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;
const scout = {
  uuid: "scout",
  name: "Alex",
  sourceTeamNumber: 8033,
  strikes: 0,
  scouterReliability: 1,
};
beforeEach(() => {
  useScouterStore.getState().setValue(scout);
  useTournamentStore.getState().setValue({
    key: "2023a",
    name: "Event",
    date: "2023-04-01",
    location: "Here",
  });
});
test("adds scouts and reports a failed save", async () => {
  postMock
    .mockResolvedValueOnce(response(scout))
    .mockResolvedValueOnce(response({}, false));
  await expect(addScouter("Alex", 8033)).resolves.toEqual(scout);
  expect(post).toHaveBeenCalledWith("/v1/manager/scouter", {
    name: "Alex",
    teamNumber: 8033,
  });
  await expect(addScouter("Alex", 8033)).rejects.toThrow(
    "Error adding scouter",
  );
});
test("validates team codes, escapes query data, and handles server/validation errors", async () => {
  const team = {
    number: 8033,
    code: "a&b",
    email: "",
    emailVerified: true,
    teamApproved: true,
    website: null,
  };
  getMock.mockResolvedValueOnce(response(team));
  await expect(checkTeamCode("a&b")).resolves.toEqual(team);
  expect(get).toHaveBeenCalledWith("/v1/manager/scouter/checkcode?code=a%26b");
  for (const [result, message] of [
    [response(false), "Code not recognized"],
    [response({}, false, "Unavailable"), "Unavailable"],
    [response({}, false), "HTTP 503"],
    [response({}), "Required"],
  ] as const) {
    getMock.mockResolvedValueOnce(result);
    await expect(checkTeamCode("bad")).rejects.toThrow(message);
  }
});
test("validates scout lists and tournament lists without accepting malformed JSON", async () => {
  getMock.mockResolvedValueOnce(response([scout]));
  await expect(getTeamScouters()).resolves.toEqual([scout]);
  getMock.mockResolvedValueOnce(response({}, false));
  await expect(getTeamScouters()).rejects.toThrow("Error fetching scouters");
  getMock.mockResolvedValueOnce(response([{}]));
  await expect(getTeamScouters()).rejects.toThrow();
  const tournament = useTournamentStore.getState().value!;
  getMock.mockResolvedValueOnce(response({ tournaments: [tournament] }));
  await expect(getTournaments()).resolves.toEqual([tournament]);
  getMock.mockResolvedValueOnce(response({}, false));
  await expect(getTournaments()).rejects.toThrow("Error fetching tournaments");
  getMock.mockResolvedValueOnce(response({ tournaments: [{}] }));
  await expect(getTournaments()).rejects.toThrow();
});
test("maps every schedule match type and alliance, including unavailable and invalid schedules", async () => {
  getMock.mockResolvedValueOnce(
    response({
      hash: "abc",
      data: [0, 1, 2].map((matchType) => ({
        matchType,
        matchNumber: 4,
        scouters: {
          scout: { team: 254, alliance: matchType === 1 ? "red" : "blue" },
        },
      })),
    }),
  );
  const result = await getScouterSchedule();
  expect(result?.data.map((m) => m.matchIdentity.matchType)).toEqual([
    "QUALIFIER",
    "PLAYOFF",
    "PRACTICE",
  ]);
  expect(result?.data[1].scouters.scout.allianceColor).toBe("RED");
  getMock.mockResolvedValueOnce(
    response({ error: "Matches are not available for this tournamnet" }, false),
  );
  await expect(getScouterSchedule()).resolves.toBeUndefined();
  getMock.mockResolvedValueOnce(response({}, false));
  await expect(getScouterSchedule()).rejects.toThrow(
    "Error fetching scouter schedule",
  );
  getMock.mockResolvedValueOnce(
    response({
      hash: "",
      data: [{ matchType: 999, matchNumber: 1, scouters: {} }],
    }),
  );
  await expect(getScouterSchedule()).rejects.toThrow("Invalid match type");
  expect(getVerionsColor("", 50, 60)).toBe("hsl(0, 50%, 60%)");
  expect(getVerionsColor("abc", 50, 60)).toMatch(/^hsl\([\d.]+, 50%, 60%\)$/);
});
test("validates full schedules, scopes the event, and aborts a stalled request", async () => {
  const data = {
    tournamentKey: "2023a",
    matches: [
      {
        matchNumber: 1,
        matchType: 0,
        teams: [{ number: 254, alliance: "red" }],
      },
    ],
  };
  getMock.mockResolvedValueOnce(response(data));
  await expect(getMatchSchedule("2023a")).resolves.toEqual(data);
  getMock.mockResolvedValueOnce(response({}, false));
  await expect(getMatchSchedule("2023a")).rejects.toThrow("Unable to fetch");
  getMock.mockResolvedValueOnce(response({ ...data, tournamentKey: "other" }));
  await expect(getMatchSchedule("2023a")).rejects.toThrow(
    "Unexpected tournament",
  );
  getMock.mockResolvedValueOnce(response({}));
  await expect(getMatchSchedule("2023a")).rejects.toThrow();
  jest.useFakeTimers();
  getMock.mockImplementationOnce(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const pending = expect(getMatchSchedule("2023a")).rejects.toThrow("aborted");
  await jest.advanceTimersByTimeAsync(15000);
  await pending;
  jest.useRealTimers();
});
test("upload retries preserve the report and expose useful errors even with non-JSON responses", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const state = useReportStateStore.getState();
  state.scoutMatch({
    scouterUUID: "scout",
    teamNumber: 8033,
    allianceColor: AllianceColor.Blue,
    matchIdentity: {
      tournamentKey: "2023a",
      matchNumber: 1,
      matchType: MatchType.Practice,
    },
  });
  state.setStartPosition(50);
  state.initializeMatchTimestamp();
  const report = useReportStateStore.getState().exportScoutReport()!;
  postMock.mockResolvedValueOnce(response({}));
  await expect(uploadReport(report)).resolves.toBeUndefined();
  for (const result of [
    response({ displayError: "Match missing" }, false),
    response({}, false),
    {
      ...response({}, false),
      json: jest.fn().mockRejectedValue(new Error("html")),
    } as unknown as Response,
  ]) {
    postMock.mockResolvedValueOnce(result);
    await expect(uploadReport(report)).rejects.toThrow();
  }
  log.mockRestore();
});

import { expect, it } from "vitest";
import { analysisReadArgs } from "../src/handler/analysis/analysisReadArgs.js";
it("preserves tenant filters while excluding struck reports and events", () => {
  const input = {
    where: { scouter: { sourceTeamNumber: 8033 } },
    include: {
      events: { where: { action: "STOP_SCORING" }, select: { points: true } },
    },
  };
  const result = analysisReadArgs("scoutReport", input);
  expect(result).toEqual({
    where: { ...input.where, analysisExcluded: false },
    include: {
      events: {
        where: { action: "STOP_SCORING", analysisExcluded: false },
        select: { points: true },
      },
    },
  });
  expect(input.include.events.where).toEqual({ action: "STOP_SCORING" });
});
it("covers nested report selections and true event includes without altering catalog filters", () => {
  expect(
    analysisReadArgs("teamMatchData", {
      where: { teamNumber: 118 },
      select: { scoutReports: { include: { events: true } } },
    }),
  ).toEqual({
    where: { teamNumber: 118 },
    select: {
      scoutReports: {
        where: { analysisExcluded: false },
        include: { events: { where: { analysisExcluded: false } } },
      },
    },
  });
});
it("applies exclusions to direct event reads and keeps identifiers intact", () => {
  expect(analysisReadArgs("event", { where: { eventUuid: "a" } })).toEqual({
    where: {
      eventUuid: "a",
      analysisExcluded: false,
      scoutReport: { analysisExcluded: false },
    },
  });
});

it("keeps source constraints on direct events while excluding their struck parent report", () => {
  const result = analysisReadArgs("event", {
    where: { scoutReport: { scouter: { sourceTeamNumber: 8033 } } },
  });
  expect(result.where.scoutReport).toEqual({
    scouter: { sourceTeamNumber: 8033 },
    analysisExcluded: false,
  });
});
it("ignores struck reports in relation-existence and every filters", () => {
  expect(
    analysisReadArgs("teamMatchData", {
      where: { scoutReports: { some: { scouterUuid: "a" } } },
    }),
  ).toEqual({
    where: {
      scoutReports: { some: { scouterUuid: "a", analysisExcluded: false } },
    },
  });
  expect(
    analysisReadArgs("teamMatchData", {
      where: { scoutReports: { every: { driverAbility: 5 } } },
    }),
  ).toEqual({
    where: {
      scoutReports: {
        every: { OR: [{ analysisExcluded: true }, { driverAbility: 5 }] },
      },
    },
  });
});

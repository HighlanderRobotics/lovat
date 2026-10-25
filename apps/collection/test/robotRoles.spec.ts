import { meta, startReport } from "./fixtures";
import { AllianceColor } from "../lib/models/AllianceColor";
import {
  robotRoleOptions,
  toggleRobotRole,
} from "../lib/collection/robotRoles";
import { chargedUpReportSchema } from "../lib/collection/ChargedUp";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { MatchType } from "../lib/models/match";

beforeEach(() => useReportStateStore.getState().reset());
test("no show is explicit, exclusive, toggleable, and distinct from immobile", () => {
  expect(
    robotRoleOptions.find((role) => role.value === "NO_SHOW")?.description,
  ).toContain("Did not appear");
  expect(toggleRobotRole(["OFFENCE", "DEFENCE"], "NO_SHOW")).toEqual([
    "NO_SHOW",
  ]);
  expect(toggleRobotRole(["NO_SHOW"], "NO_SHOW")).toEqual([]);
  expect(toggleRobotRole(["NO_SHOW"], "IMMOBILE")).toEqual(["IMMOBILE"]);
  expect(toggleRobotRole(["OFFENCE"], "DEFENCE")).toEqual([
    "OFFENCE",
    "DEFENCE",
  ]);
  expect(toggleRobotRole(["OFFENCE", "DEFENCE"], "OFFENCE")).toEqual([
    "DEFENCE",
  ]);
});
test("no show survives report serialization and rejects contradictory roles", () => {
  const store = () => useReportStateStore.getState();
  store().scoutMatch({
    scouterUUID: "scout",
    teamNumber: 8033,
    allianceColor: AllianceColor.Blue,
    matchIdentity: {
      tournamentKey: "2023mock",
      matchNumber: 1,
      matchType: MatchType.Practice,
    },
  });
  store().setStartPosition(50);
  store().initializeMatchTimestamp();
  store().preparePostMatch();
  expect(store().robotRoles).toEqual([]); // No events alone cannot establish absence.
  store().setPostMatch({ robotRoles: ["NO_SHOW"] });
  const report = store().exportScoutReport()!;
  expect(
    chargedUpReportSchema.parse(JSON.parse(JSON.stringify(report))).robotRoles,
  ).toEqual(["NO_SHOW"]);
  expect(
    chargedUpReportSchema.safeParse({
      ...report,
      robotRoles: ["NO_SHOW", "OFFENCE"],
    }).success,
  ).toBe(false);
});

import {
  activeActivity,
  canRecordEvent,
  eventSchema,
  type ChargedUpEvent,
} from "../lib/collection/ChargedUp";
import { postMatchDefaults } from "../lib/collection/postMatchDefaults";
test("historical camping intervals remain readable, stoppable and undoable", () => {
  const start: ChargedUpEvent = {
    time: 1,
    action: "START_CAMPING",
    location: "OPPONENT_STATION",
  };
  expect(activeActivity([start])).toBe("CAMPING");
  expect(
    canRecordEvent([start], null, {
      action: "STOP_CAMPING",
      location: "OPPONENT_STATION",
    }),
  ).toBe(true);
  startReport();
  useReportStateStore.setState({
    startTimestamp: new Date(Date.now() - 5000),
    events: [start],
  });
  useReportStateStore.getState().stopHold();
  expect(useReportStateStore.getState().events.at(-1)?.action).toBe(
    "STOP_CAMPING",
  );
  useReportStateStore.getState().undoEvent();
  expect(useReportStateStore.getState().events).toEqual([]);
});
test("incomplete scoring records cannot serialize or claim a legal grid action", () => {
  expect(
    eventSchema.safeParse({ time: 1, action: "SCORE_CONE", location: "SCORE" })
      .success,
  ).toBe(false);
  expect(
    eventSchema.safeParse({
      time: 1,
      action: "DROP",
      location: "CENTER",
      scoringLocation: "A1",
    }).success,
  ).toBe(false);
  expect(
    canRecordEvent([], "CONE", { action: "SCORE_CONE", location: "SCORE" }),
  ).toBe(false);
});
test("post-match defaults infer station-only and mixed intakes without assuming missing observations", () => {
  expect(postMatchDefaults([]).intakeType).toBe("NEITHER");
  expect(
    postMatchDefaults([
      { time: 1, action: "INTAKE_CONE", location: "ALLIANCE_ZONE" },
      { time: 5, action: "INTAKE_CUBE", location: "ALLIANCE_STATION" },
    ]).intakePieces,
  ).toBe("BOTH");
  expect(
    postMatchDefaults([
      { time: 5, action: "INTAKE_CONE", location: "ALLIANCE_STATION" },
    ]).intakeType,
  ).toBe("STATION");
});
test("a completed setup is immutable and incomplete reports cannot be exported", () => {
  const store = () => useReportStateStore.getState();
  store().reset();
  expect(store().exportScoutReport()).toBeNull();
  store().scoutMatch({
    ...meta,
    matchIdentity: { ...meta.matchIdentity, matchType: MatchType.Elimination },
  });
  store().setStartPosition(50);
  store().initializeMatchTimestamp();
  store().setFieldPiece(0);
  expect(store().fieldPieces[0]).toBe("UNKNOWN");
  expect(store().exportScoutReport()?.matchType).toBe("ELIMINATION");
});

test("cube-only observations prefill the cube intake choice", () => {
  expect(
    postMatchDefaults([
      { time: 5, action: "INTAKE_CUBE", location: "ALLIANCE_STATION" },
    ]).intakePieces,
  ).toBe("CUBE");
});

import { expect, test } from "bun:test";
import { buildCalgamesReportImport } from "../src/calgames-report-archive";
const target = {
  userCount: 1,
  team: 8033,
  username: "Synthetic",
  email: "preview-8033@example.invalid",
};
const archive = () => ({
  format: "lovat-calgames-reports-v1",
  eventKey: "2026cacg",
  Season: [{ year: 2026 }],
  DistrictSeason: [],
  Team: [{ number: 8033 }],
  Tournament: [{ key: "2026cacg", name: "CalGames", seasonYear: 2026 }],
  TeamSeason: [{ teamNumber: 8033, seasonYear: 2026 }],
  TeamTournament: [{ teamNumber: 8033, tournamentKey: "2026cacg" }],
  Match: [{ key: "2026cacg_qm1", tournamentKey: "2026cacg" }],
  MatchAlliance: [{ matchKey: "2026cacg_qm1", color: "RED" }],
  TeamMatchData: [{ key: "slot", tournamentKey: "2026cacg", teamNumber: 8033 }],
  Scouter: [{ uuid: "scout", name: "Synthetic", sourceTeamNumber: 8033 }],
  ScoutReport: [
    {
      uuid: "report",
      teamMatchKey: "slot",
      scouterUuid: "scout",
      notes: "Quoted ' notes $data_test$",
    },
  ],
  Event: [{ eventUuid: "event", scoutReportUuid: "report" }],
});
test("prepares bounded additive atomic SQL without copying source account access", () => {
  const a = buildCalgamesReportImport(archive(), target);
  expect(a.manifest.counts.ScoutReport).toBe(1);
  expect(a.sql.startsWith("BEGIN;")).toBe(true);
  expect(a.sql.endsWith("COMMIT;\n")).toBe(true);
  expect(a.sql).toContain("ON CONFLICT");
  expect(a.sql).toContain("Conflicting source rows");
  expect(a.sql).not.toContain("DELETE FROM");
  expect(a.sql).not.toContain('UPDATE "');
  expect(a.sql).toContain("false,false");
  expect(buildCalgamesReportImport(archive(), target)).toEqual(a);
});
test("rejects unexpected destinations and imported account fields", () => {
  expect(() =>
    buildCalgamesReportImport(archive(), {
      ...target,
      email: "real@example.com",
    }),
  ).toThrow();
  expect(() =>
    buildCalgamesReportImport({ ...archive(), User: [] }, target),
  ).toThrow();
  const a = archive();
  Object.assign(a.Scouter[0]!, { email: "private@example.invalid" });
  expect(() => buildCalgamesReportImport(a, target)).toThrow(
    "Unnecessary scouter data",
  );
});
test("rejects cross-event data, duplicate identities and orphaned attribution", () => {
  let a = archive();
  a.Match[0]!.tournamentKey = "other";
  expect(() => buildCalgamesReportImport(a, target)).toThrow("Cross-event");
  a = archive();
  a.Event.push({ ...a.Event[0]! });
  expect(() => buildCalgamesReportImport(a, target)).toThrow(
    "Invalid Event identities",
  );
  a = archive();
  a.ScoutReport[0]!.scouterUuid = "missing";
  expect(() => buildCalgamesReportImport(a, target)).toThrow(
    "Missing source dependency",
  );
  a = archive();
  a.Event[0]!.scoutReportUuid = "missing";
  expect(() => buildCalgamesReportImport(a, target)).toThrow(
    "Missing source dependency",
  );
});

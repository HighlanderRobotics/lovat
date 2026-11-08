import XCTest

@testable import LovatWatchCore

final class ScheduleTests: XCTestCase {
  private let context = PhoneContext(
    signedIn: true, revision: 1, apiURL: "https://api.example.com",
    teamCode: "test-code", teamNumber: 8033, scouterUUID: "me", tournamentKey: "2026test"
  )

  func testFiltersAssignmentsAndPrefersPredictedTime() throws {
    let response = try JSONDecoder().decode(
      ScheduleResponse.self,
      from: Data(
        """
        {"hash":"one","data":[
          {"matchType":0,"matchNumber":2,"scouters":{"other":{"team":254,"alliance":"red"}}},
          {"matchType":0,"matchNumber":1,"scouters":{"me":{"team":8033,"alliance":"blue"}},
           "scheduledTime":"2026-06-15T12:00:00Z","predictedTime":"2026-06-15T12:08:00.000Z","status":"SCHEDULED"}
        ]}
        """.utf8))
    let assignments = WatchMatch.assignments(from: response, context: context)
    XCTAssertEqual(assignments.count, 1)
    XCTAssertEqual(assignments[0].team, 8033)
    XCTAssertEqual(assignments[0].startTime, WatchMatch.parseDate("2026-06-15T12:08:00Z"))
    XCTAssertFalse(assignments[0].finished)
  }

  func testLegacyScheduleDisplaysWithoutInventingReminders() throws {
    let response = try JSONDecoder().decode(
      ScheduleResponse.self,
      from: Data(
        """
        {"hash":"old","data":[{"matchType":0,"matchNumber":1,"scouters":{"me":{"team":8033,"alliance":"red"}}}]}
        """.utf8))
    let match = try XCTUnwrap(WatchMatch.assignments(from: response, context: context).first)
    XCTAssertNil(match.startTime)
    XCTAssertNil(match.reminderDate(now: Date()))
  }

  func testRemindersSkipFinishedAndPastMatches() {
    let start = Date(timeIntervalSince1970: 2000)
    let match = WatchMatch(
      matchType: 0, matchNumber: 1, team: 8033, alliance: "red",
      scheduledTime: start, predictedTime: nil, finished: false)
    XCTAssertEqual(
      match.reminderDate(now: start.addingTimeInterval(-600)), start.addingTimeInterval(-300))
    XCTAssertEqual(
      match.reminderDate(now: start.addingTimeInterval(-30)), start.addingTimeInterval(-29))
    XCTAssertNil(match.reminderDate(now: start))
    let completed = WatchMatch(
      matchType: 0, matchNumber: 1, team: 8033, alliance: "red",
      scheduledTime: start, predictedTime: nil, finished: true)
    XCTAssertNil(completed.reminderDate(now: start.addingTimeInterval(-600)))
  }

  func testLocalTimeCanScheduleAReminderWithoutBackendTiming() {
    let start = Date(timeIntervalSince1970: 2000)
    var match = WatchMatch(
      matchType: 0, matchNumber: 1, team: 8033, alliance: "red",
      scheduledTime: nil, predictedTime: nil, finished: false)
    XCTAssertNil(match.reminderDate(now: start.addingTimeInterval(-600)))
    match.manualTime = start
    XCTAssertEqual(
      match.reminderDate(now: start.addingTimeInterval(-600)), start.addingTimeInterval(-300))
    match.manualTime = nil
    XCTAssertNil(match.reminderDate(now: start.addingTimeInterval(-600)))
  }

  func testCredentialsAndTournamentArePartOfIdentity() {
    var changed = context
    changed.teamCode = "another-code"
    XCTAssertFalse(context.sameIdentity(as: changed))
    changed = context
    changed.tournamentKey = "other"
    XCTAssertFalse(context.sameIdentity(as: changed))
    changed = context
    changed.completedMatches = ["0-1"]
    XCTAssertTrue(context.sameIdentity(as: changed))
  }

  func testEndpointRequiresHTTPSAndNoEmbeddedCredentials() {
    XCTAssertEqual(
      context.endpoint?.absoluteString,
      "https://api.example.com/collection/schedules/2026test")
    for url in [
      "http://api.example.com", "https://user:secret@api.example.com",
      "https://api.example.com?token=x",
    ] {
      var changed = context
      changed.apiURL = url
      XCTAssertNil(changed.endpoint)
      XCTAssertFalse(changed.isReady)
    }
  }
}

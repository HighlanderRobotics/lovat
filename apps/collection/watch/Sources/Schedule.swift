import Foundation

struct PhoneContext: Codable, Equatable {
  let signedIn: Bool
  let revision: Double
  var apiURL: String?
  var teamCode: String?
  var teamNumber: Int?
  var scouterUUID: String?
  var scouterName: String?
  var tournamentKey: String?
  var tournamentName: String?
  var completedMatches: [String]?

  var isReady: Bool {
    signedIn && !(teamCode ?? "").isEmpty && !(scouterUUID ?? "").isEmpty
      && !(tournamentKey ?? "").isEmpty && endpoint != nil
  }

  var endpoint: URL? {
    guard let apiURL, var url = URL(string: apiURL),
      url.scheme == "https", url.host != nil,
      url.user == nil, url.password == nil,
      url.query == nil, url.fragment == nil,
      let tournamentKey, !tournamentKey.isEmpty
    else { return nil }
    url.appendPathComponent("collection/schedules")
    url.appendPathComponent(tournamentKey)
    return url
  }

  // A team code change must invalidate an in-flight request and its cache too.
  func sameIdentity(as other: PhoneContext?) -> Bool {
    guard let other else { return false }
    return signedIn == other.signedIn && apiURL == other.apiURL
      && teamCode == other.teamCode && teamNumber == other.teamNumber
      && scouterUUID == other.scouterUUID && tournamentKey == other.tournamentKey
  }
}

struct ScheduleResponse: Decodable {
  let hash: String
  let data: [ScheduleMatch]
}

struct ScheduleMatch: Codable {
  let matchType: Int
  let matchNumber: Int
  let scouters: [String: Assignment]
  var scheduledTime: String?
  var predictedTime: String?
  var actualTime: String?
  var status: String?

  struct Assignment: Codable {
    let team: Int
    let alliance: String
  }
}

struct WatchMatch: Codable, Identifiable, Equatable {
  let matchType: Int
  let matchNumber: Int
  let team: Int
  let alliance: String
  let scheduledTime: Date?
  let predictedTime: Date?
  let finished: Bool
  var manualTime: Date? = nil

  var id: String { "\(matchType)-\(matchNumber)" }
  var label: String { "\(matchType == 0 ? "Qual" : "Playoff") \(matchNumber)" }
  var startTime: Date? { manualTime ?? predictedTime ?? scheduledTime }

  static func assignments(from response: ScheduleResponse, context: PhoneContext) -> [WatchMatch] {
    guard let scouter = context.scouterUUID else { return [] }
    return response.data.compactMap { match in
      guard let assignment = match.scouters[scouter] else { return nil }
      return WatchMatch(
        matchType: match.matchType, matchNumber: match.matchNumber,
        team: assignment.team, alliance: assignment.alliance,
        scheduledTime: parseDate(match.scheduledTime),
        predictedTime: parseDate(match.predictedTime),
        finished: match.actualTime != nil
          || ["COMPLETED", "CANCELED", "IN_PROGRESS"].contains(match.status ?? "")
      )
    }.sorted { ($0.matchType, $0.matchNumber) < ($1.matchType, $1.matchNumber) }
  }

  static func parseDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

  func reminderDate(now: Date, leadTime: TimeInterval = 300) -> Date? {
    guard !finished, let startTime, startTime > now else { return nil }
    let reminder = startTime.addingTimeInterval(-leadTime)
    // If refreshed shortly before a match, give one immediate reminder.
    return max(reminder, now.addingTimeInterval(1))
  }
}

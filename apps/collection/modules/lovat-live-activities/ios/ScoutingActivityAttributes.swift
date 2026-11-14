import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct ScoutingActivityAttributes: ActivityAttributes {
  struct Assignment: Codable, Hashable {
    var matchKey: String
    var matchLabel: String
    var teamNumber: Int
  }

  struct ContentState: Codable, Hashable {
    var phase: String
    var nowMatch: String
    var assignments: [Assignment]
    var tournamentName: String
    var nextStartTime: Double?
    var updatedAt: Double
  }

  var tournamentKey: String
  var scouterUuid: String
  var preview: Bool
}

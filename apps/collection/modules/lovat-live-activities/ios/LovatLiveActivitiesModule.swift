import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

public class LovatLiveActivitiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LovatLiveActivities")

    OnCreate {
      if #available(iOS 16.2, *) {
        Task { @MainActor in _ = ScoutingActivityCoordinator.shared }
      }
    }

    AsyncFunction("status") { () async -> [String: Any] in
      if #available(iOS 16.2, *) {
        return await ScoutingActivityCoordinator.shared.status()
      }
      return ["supported": false, "enabled": false, "active": false]
    }

    AsyncFunction("sync") { (config: [String: String], json: String?, preview: Bool) async throws -> [String: Any] in
      if #available(iOS 16.2, *) {
        return try await ScoutingActivityCoordinator.shared.sync(config: config, json: json, preview: preview)
      }
      return ["supported": false, "enabled": false, "active": false]
    }

    AsyncFunction("stop") { () async -> Void in
      if #available(iOS 16.2, *) {
        await ScoutingActivityCoordinator.shared.stop()
      }
    }
  }
}

@available(iOS 16.2, *)
@MainActor
private final class ScoutingActivityCoordinator {
  static let shared = ScoutingActivityCoordinator()
  private let storageKey = "lovat.liveActivity.configuration"
  private var config: [String: String]
  private var observers: [String: Task<Void, Never>] = [:]
  private var activityObserver: Task<Void, Never>?
  private var startObserver: Task<Void, Never>?
  private var lastRegistrationError: String?
  private var dismissed = false
  private var stopping = false
  private var lastRequest: Task<Void, Error>?

  private init() {
    config = UserDefaults.standard.dictionary(forKey: storageKey) as? [String: String] ?? [:]
    activityObserver = Task { [weak self] in
      for await activity in Activity<ScoutingActivityAttributes>.activityUpdates {
        self?.observe(activity)
      }
    }
    if #available(iOS 17.2, *) {
      startObserver = Task { [weak self] in
        for await token in Activity<ScoutingActivityAttributes>.pushToStartTokenUpdates {
          await self?.register(token: token, kind: "start", activityId: nil)
        }
      }
    }
    for activity in Activity<ScoutingActivityAttributes>.activities {
      observe(activity)
    }
  }

  func status() -> [String: Any] {
    var result: [String: Any] = [
      "supported": UIDevice.current.userInterfaceIdiom == .phone,
      "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
      "active": Activity<ScoutingActivityAttributes>.activities.contains {
        $0.activityState == .active || $0.activityState == .stale
      },
    ]
    if let error = lastRegistrationError { result["registrationError"] = error }
    return result
  }

  func sync(config newConfig: [String: String], json: String?, preview: Bool) async throws -> [String: Any] {
    if !preview && config != newConfig {
      await stop()
      config = newConfig
      dismissed = false
      UserDefaults.standard.set(config, forKey: storageKey)
    }
    if #available(iOS 17.2, *), !preview,
       let token = Activity<ScoutingActivityAttributes>.pushToStartToken {
      await register(token: token, kind: "start", activityId: nil)
    }
    guard let json, let data = json.data(using: .utf8) else {
      await endActivities()
      return status()
    }
    let state = try JSONDecoder().decode(ScoutingActivityAttributes.ContentState.self, from: data)
    guard !state.assignments.isEmpty,
          ActivityAuthorizationInfo().areActivitiesEnabled,
          UIDevice.current.userInterfaceIdiom == .phone else { return status() }

    let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(300))
    let existing = Activity<ScoutingActivityAttributes>.activities.first {
      ($0.activityState == .active || $0.activityState == .stale) &&
      $0.attributes.preview == preview &&
      (preview || ($0.attributes.scouterUuid == config["scouterUuid"] &&
                   $0.attributes.tournamentKey == config["tournamentKey"]))
    }
    if let existing {
      await existing.update(content)
      observe(existing)
    } else if UIApplication.shared.applicationState == .active && (!dismissed || preview) {
      await endActivities()
      let attributes = ScoutingActivityAttributes(
        tournamentKey: preview ? "preview" : config["tournamentKey", default: ""],
        scouterUuid: preview ? "preview" : config["scouterUuid", default: ""],
        preview: preview
      )
      #if targetEnvironment(simulator)
      let pushType: PushType? = nil
      #else
      let pushType: PushType? = preview ? nil : .token
      #endif
      let activity = try Activity.request(attributes: attributes, content: content, pushType: pushType)
      observe(activity)
    }
    return status()
  }

  private func observe(_ activity: Activity<ScoutingActivityAttributes>) {
    guard !activity.attributes.preview, observers[activity.id] == nil else { return }
    observers[activity.id] = Task { [weak self] in
      for await token in activity.pushTokenUpdates {
        await self?.register(token: token, kind: "update", activityId: activity.id)
      }
    }
    observers[activity.id + ".state"] = Task { [weak self] in
      for await state in activity.activityStateUpdates {
        if Task.isCancelled { break }
        if state == .dismissed {
          self?.dismissed = true
          await self?.unregister()
          break
        }
      }
    }
    if let token = activity.pushToken {
      Task { await register(token: token, kind: "update", activityId: activity.id) }
    }
  }

  private func register(token: Data, kind: String, activityId: String?) async {
    guard !config.isEmpty, !dismissed, !stopping else { return }
    #if DEBUG
    let environment = "sandbox"
    #else
    let environment = "production"
    #endif
    var body: [String: Any] = [
      "installationId": config["installationId", default: ""],
      "tournamentKey": config["tournamentKey", default: ""],
      "environment": environment,
      "kind": kind,
      "token": token.map { String(format: "%02x", $0) }.joined(),
    ]
    if let activityId { body["activityId"] = activityId }
    do {
      try await request(path: "/collection/live-activities", method: "POST", body: body)
      lastRegistrationError = nil
    } catch {
      lastRegistrationError = "Background registration failed. Open Collection to retry."
    }
  }

  private func request(path: String, method: String, body: [String: Any]? = nil) async throws {
    guard let base = config["baseUrl"], let url = URL(string: base + path) else { return }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 15
    request.setValue(config["teamCode"], forHTTPHeaderField: "X-Team-Code")
    request.setValue(config["scouterUuid"], forHTTPHeaderField: "X-Scouter-UUID")
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let previous = lastRequest
    let task = Task {
      _ = try? await previous?.value
      let (_, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        throw URLError(.badServerResponse)
      }
    }
    lastRequest = task
    try await task.value
  }

  private func unregister() async {
    guard let installation = config["installationId"] else { return }
    try? await request(path: "/collection/live-activities/" + installation, method: "DELETE")
  }

  private func endActivities() async {
    observers.values.forEach { $0.cancel() }
    observers.removeAll()
    for activity in Activity<ScoutingActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  func stop() async {
    stopping = true
    await unregister()
    await endActivities()
    config = [:]
    UserDefaults.standard.removeObject(forKey: storageKey)
    dismissed = false
    stopping = false
  }
}

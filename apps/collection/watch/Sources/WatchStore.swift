import Combine
import Foundation
import Security
import UserNotifications
import WatchConnectivity
import WatchKit

@MainActor
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchStore()
  @Published private(set) var context: PhoneContext?
  @Published private(set) var matches: [WatchMatch] = []
  @Published private(set) var lastUpdated: Date?
  @Published private(set) var error: String?
  @Published private(set) var loading = false
  @Published private(set) var manualTimes: [String: Date] = [:]
  @Published var remindersEnabled = UserDefaults.standard.bool(forKey: "remindersEnabled")

  private var refreshTask: Task<Void, Never>?
  private var delivered: Set<String> = []
  private var scheduled: [String: Date] = [:]
  private var reminderGeneration = 0
  private var reminderQueue: Task<Void, Never>?
  private var refreshGeneration = 0
  private let notificationCenter = UNUserNotificationCenter.current()

  private struct Cache: Codable {
    let matches: [WatchMatch]
    let lastUpdated: Date
    let delivered: Set<String>
    let scheduled: [String: Date]
    let manualTimes: [String: Date]
  }

  override private init() {
    super.init()
    if let data = SecureStorage.read(),
      let saved = try? JSONDecoder().decode(PhoneContext.self, from: data)
    {
      context = saved
      if saved.isReady, let data = UserDefaults.standard.data(forKey: "scheduleCache"),
        let cache = try? JSONDecoder().decode(Cache.self, from: data)
      {
        matches = cache.matches
        lastUpdated = cache.lastUpdated
        delivered = cache.delivered
        scheduled = cache.scheduled
        manualTimes = cache.manualTimes
      }
    }
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  var displayedMatches: [WatchMatch] {
    matches.map { match in
      var result = match
      result.manualTime = manualTimes[match.id]
      return result
    }
  }

  var remainingMatches: [WatchMatch] {
    let completed = Set(context?.completedMatches ?? [])
    return displayedMatches.filter { !$0.finished && !completed.contains($0.id) }
  }

  func foreground() {
    if WCSession.default.isReachable {
      WCSession.default.sendMessage(
        ["requestContext": true],
        replyHandler: { payload in
          self.receive(payload)
        }, errorHandler: { _ in })
    }
    reload()
  }

  func reload() {
    refreshTask?.cancel()
    refreshTask = Task { await refresh() }
  }

  func refresh() async {
    guard let identity = context, identity.isReady, let endpoint = identity.endpoint else { return }
    refreshGeneration += 1
    let requestGeneration = refreshGeneration
    loading = true
    defer {
      if requestGeneration == refreshGeneration, identity.sameIdentity(as: context) {
        loading = false
      }
    }
    do {
      var request = URLRequest(url: endpoint)
      request.timeoutInterval = 25
      request.setValue(identity.teamCode, forHTTPHeaderField: "X-Team-Code")
      request.setValue(identity.scouterUUID, forHTTPHeaderField: "X-Scouter-UUID")
      request.setValue("watchOS", forHTTPHeaderField: "X-OS-Name")
      // Reject redirects so a changed authority cannot receive the team credential.
      let session = URLSession(
        configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
      defer { session.invalidateAndCancel() }
      let (data, response) = try await session.data(for: request)
      try Task.checkCancellation()
      guard requestGeneration == refreshGeneration, identity.sameIdentity(as: context) else {
        return
      }
      guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      if http.statusCode == 400,
        let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        body["code"] as? String == "MATCHES_NOT_AVAILABLE"
          || body["error"] as? String == "Matches are not available for this tournamnet"
      {
        matches = []
      } else {
        guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
        let result = try JSONDecoder().decode(ScheduleResponse.self, from: data)
        matches = WatchMatch.assignments(from: result, context: identity)
      }
      lastUpdated = Date()
      error = nil
      saveCache()
      await reconcileReminders()
    } catch is CancellationError {
      // A newer session or refresh owns the result.
    } catch {
      guard requestGeneration == refreshGeneration, identity.sameIdentity(as: context),
        !Task.isCancelled
      else { return }
      self.error = "Couldn't refresh. Open Collection on iPhone and check your connection."
    }
    scheduleBackgroundRefresh()
  }

  func setReminders(_ enabled: Bool) async {
    if enabled {
      do {
        remindersEnabled = try await notificationCenter.requestAuthorization(options: [
          .alert, .sound,
        ])
      } catch { remindersEnabled = false }
    } else {
      remindersEnabled = false
    }
    if !remindersEnabled { scheduled = [:] }
    UserDefaults.standard.set(remindersEnabled, forKey: "remindersEnabled")
    await reconcileReminders()
  }

  private func apply(_ incoming: PhoneContext) async {
    guard incoming.revision >= (context?.revision ?? 0) else { return }
    refreshTask?.cancel()
    refreshGeneration += 1
    if !incoming.sameIdentity(as: context) {
      notificationCenter.removeAllPendingNotificationRequests()
      notificationCenter.removeAllDeliveredNotifications()
      matches = []
      delivered = []
      scheduled = [:]
      manualTimes = [:]
      reminderGeneration += 1
      lastUpdated = nil
      loading = false
      UserDefaults.standard.removeObject(forKey: "scheduleCache")
    }
    do {
      try SecureStorage.write(JSONEncoder().encode(incoming))
    } catch let failure as SecureStorage.WriteFailure {
      if failure.status == errSecInteractionNotAllowed {
        error = "Unlock your watch to sync Collection."
      } else if failure.status == errSecMissingEntitlement {
        error = "Secure sign-in isn't available in this build. Reinstall the watch app."
      } else {
        error = "Couldn't securely save your sign-in. Reopen Collection and try again."
      }
      #if DEBUG
        // Record only the status, never credentials or the incoming context.
        print("Watch Keychain save failed: \(failure.status)")
      #endif
      return
    } catch {
      self.error = "Couldn't sync your sign-in. Reopen Collection and try again."
      return
    }
    context = incoming
    if incoming.signedIn && !incoming.isReady {
      error = "Select a scouter, tournament, and HTTPS server in Collection on iPhone."
    } else {
      error = nil
    }
    await reconcileReminders()
    reload()
  }

  func setManualTime(_ date: Date?, for match: WatchMatch) async {
    guard matches.contains(where: { $0.id == match.id }) else { return }
    manualTimes[match.id] = date
    let id = notificationID(match)
    delivered.remove(id)
    scheduled.removeValue(forKey: id)
    saveCache()
    await reconcileReminders()
  }

  private func saveCache() {
    guard let lastUpdated else { return }
    if let data = try? JSONEncoder().encode(
      Cache(
        matches: matches, lastUpdated: lastUpdated, delivered: delivered, scheduled: scheduled,
        manualTimes: manualTimes))
    {
      UserDefaults.standard.set(data, forKey: "scheduleCache")
    }
  }

  private func reconcileReminders() async {
    // Serialize notification replacement: an older add() must finish before
    // the new session removes and replaces its pending requests.
    reminderGeneration += 1
    let generation = reminderGeneration
    let preceding = reminderQueue
    let task = Task { @MainActor in
      await preceding?.value
      guard generation == self.reminderGeneration else { return }
      await self.updateReminders(generation: generation)
    }
    reminderQueue = task
    await task.value
  }

  private func updateReminders(generation: Int) async {
    let revision = context?.revision
    let deliveredNotifications = await notificationCenter.deliveredNotifications()
    guard generation == reminderGeneration, revision == context?.revision else { return }
    for notification in deliveredNotifications {
      delivered.insert(notification.request.identifier)
    }
    let pending = await notificationCenter.pendingNotificationRequests()
    guard generation == reminderGeneration, revision == context?.revision else { return }
    let pendingIDs = Set(pending.map(\.identifier))
    let now = Date()
    // Existing reminders that have fired must never be re-added on a later refresh.
    for match in matches {
      let id = notificationID(match)
      if !pendingIDs.contains(id), let time = scheduled[id],
        time <= now
      {
        delivered.insert(id)
      }
    }
    notificationCenter.removeAllPendingNotificationRequests()
    guard remindersEnabled, context?.isReady == true else {
      saveCache()
      return
    }
    for match in remainingMatches.prefix(50) {
      let id = notificationID(match)
      guard !delivered.contains(id), let date = match.reminderDate(now: now) else { continue }
      let content = UNMutableNotificationContent()
      content.title = "Scouting soon: \(match.label)"
      content.body = "Scout team \(match.team) on the \(match.alliance) alliance."
      content.sound = .default
      let trigger = UNTimeIntervalNotificationTrigger(
        timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
      do {
        try await notificationCenter.add(
          UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        guard generation == reminderGeneration, revision == context?.revision else {
          notificationCenter.removePendingNotificationRequests(withIdentifiers: [id])
          return
        }
        scheduled[id] = date
      } catch { self.error = "Couldn't schedule match reminders. Check notification settings." }
    }
    saveCache()
  }

  private func notificationID(_ match: WatchMatch) -> String {
    "lovat.\(context?.tournamentKey ?? "").\(context?.scouterUUID ?? "").\(match.id)"
  }

  func scheduleBackgroundRefresh() {
    guard context?.isReady == true else { return }
    WKApplication.shared().scheduleBackgroundRefresh(
      withPreferredDate: Date().addingTimeInterval(900), userInfo: nil
    ) { _ in }
  }

  nonisolated private func receive(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let incoming = try? JSONDecoder().decode(PhoneContext.self, from: data)
    else { return }
    Task { @MainActor in await self.apply(incoming) }
  }

  nonisolated func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    receive(session.receivedApplicationContext)
    Task { @MainActor in self.foreground() }
  }
  nonisolated func session(
    _ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]
  ) { receive(applicationContext) }
  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

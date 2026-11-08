import Foundation
import WatchConnectivity

final class PhoneWatchSession: NSObject, WCSessionDelegate {
  static let shared = PhoneWatchSession()
  private var latest: [String: Any] = [:]

  func start() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func update(_ json: String) throws {
    guard let data = json.data(using: .utf8),
      let context = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return
    }
    // Wait for hydrated JavaScript state after launch. Replaying a separate
    // credential cache here could briefly restore an old account after reset.
    latest = context
    publish()
  }

  private func publish() {
    guard !latest.isEmpty, WCSession.isSupported(), WCSession.default.activationState == .activated,
      WCSession.default.isPaired, WCSession.default.isWatchAppInstalled
    else { return }
    try? WCSession.default.updateApplicationContext(latest)
    if WCSession.default.isReachable {
      WCSession.default.sendMessage(latest, replyHandler: nil, errorHandler: { _ in })
    }
  }

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    DispatchQueue.main.async { self.publish() }
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    DispatchQueue.main.async { self.publish() }
  }

  func session(
    _ session: WCSession, didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    DispatchQueue.main.async { replyHandler(self.latest) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}

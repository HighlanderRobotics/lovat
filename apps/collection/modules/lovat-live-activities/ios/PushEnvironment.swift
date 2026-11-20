import Foundation

enum PushEnvironment {
  // Local Release builds can still be development-signed. DEBUG describes
  // compiler optimization, not the APNs environment assigned by provisioning.
  static let current: String? = {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") else {
      // App Store/TestFlight installations don't carry a provisioning profile.
      return resolve(profile: nil)
    }
    guard let data = try? Data(contentsOf: url) else { return nil }
    return resolve(profile: data)
  }()

  static func resolve(profile: Data?) -> String? {
    guard let profile else { return "production" }
    // The signed CMS envelope contains an XML plist. Read only the embedded
    // entitlement; iOS validates the signature when installing the app.
    guard let start = profile.range(of: Data("<plist".utf8)),
          let end = profile.range(of: Data("</plist>".utf8), in: start.lowerBound..<profile.endIndex),
          let plist = try? PropertyListSerialization.propertyList(
            from: profile.subdata(in: start.lowerBound..<end.upperBound), options: [], format: nil
          ) as? [String: Any],
          let entitlements = plist["Entitlements"] as? [String: Any],
          let environment = entitlements["aps-environment"] as? String else { return nil }
    switch environment {
    case "development": return "sandbox"
    case "production": return "production"
    default: return nil
    }
  }
}

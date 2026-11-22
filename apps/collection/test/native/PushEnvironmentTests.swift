import Foundation

@main
struct PushEnvironmentTests {
  static func main() throws {
    func profile(_ environment: String?) throws -> Data {
      let entitlements = environment.map { ["aps-environment": $0] } ?? [:]
      let plist = try PropertyListSerialization.data(
        fromPropertyList: ["Entitlements": entitlements], format: .xml, options: 0
      )
      return Data([0x30, 0x82, 0xff, 0x00]) + plist + Data([0xff, 0x00])
    }
    let development = try profile("development")
    let production = try profile("production")
    let missing = try profile(nil)
    let unknown = try profile("unknown")
    precondition(PushEnvironment.resolve(profile: development) == "sandbox")
    precondition(PushEnvironment.resolve(profile: production) == "production")
    precondition(PushEnvironment.resolve(profile: nil) == "production")
    precondition(PushEnvironment.resolve(profile: missing) == nil)
    precondition(PushEnvironment.resolve(profile: unknown) == nil)
    precondition(PushEnvironment.resolve(profile: Data("<plist>broken".utf8)) == nil)
    if let path = CommandLine.arguments.dropFirst().first {
      let result = PushEnvironment.resolve(profile: try Data(contentsOf: URL(fileURLWithPath: path)))
      precondition(result == "sandbox", "The installed development build must register sandbox tokens")
    }
    print("Push environment checks passed")
  }
}

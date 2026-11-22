import ExpoModulesCore

public final class LovatWatchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LovatWatch")

    OnCreate {
      PhoneWatchSession.shared.start()
    }

    AsyncFunction("syncContext") { (json: String) in
      try PhoneWatchSession.shared.update(json)
    }.runOnQueue(.main)
  }
}

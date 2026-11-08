// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "LovatWatchCore",
  platforms: [.macOS(.v13)],
  products: [.library(name: "LovatWatchCore", targets: ["LovatWatchCore"])],
  targets: [
    .target(
      name: "LovatWatchCore", path: "Sources",
      exclude: ["LovatWatchApp.swift", "WatchStore.swift", "SecureStorage.swift"],
      sources: ["Schedule.swift"]),
    .testTarget(name: "LovatWatchCoreTests", dependencies: ["LovatWatchCore"], path: "Tests"),
  ]
)

import SwiftUI
import UserNotifications
import WatchKit

@main
struct LovatWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchDelegate.self) var delegate
  @StateObject private var store = WatchStore.shared
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      ScheduleView(store: store)
        .onChange(of: scenePhase) { _, phase in
          if phase == .active { store.foreground() }
        }
    }
  }
}

final class WatchDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
  func applicationDidFinishLaunching() {
    UNUserNotificationCenter.current().delegate = self
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    for task in backgroundTasks {
      if let refresh = task as? WKApplicationRefreshBackgroundTask {
        Task { @MainActor in
          await WatchStore.shared.refresh()
          refresh.setTaskCompletedWithSnapshot(false)
        }
      } else {
        task.setTaskCompletedWithSnapshot(false)
      }
    }
  }
}

private struct ScheduleView: View {
  @ObservedObject var store: WatchStore

  var body: some View {
    NavigationStack {
      List {
        if store.context?.isReady == true {
          Section {
            VStack(alignment: .leading, spacing: 4) {
              Text(store.context?.scouterName ?? "Your schedule")
                .font(.headline)
              Text(store.context?.tournamentName ?? "Tournament")
                .font(.caption).foregroundStyle(.secondary)
              if let updated = store.lastUpdated {
                Text("Updated \(updated, style: .relative) ago")
                  .font(.caption2).foregroundStyle(.secondary)
              }
            }
          }
          if let next = store.remainingMatches.first {
            Section("Next assignment") {
              NavigationLink {
                MatchReminderView(store: store, match: next)
              } label: {
                MatchRow(match: next)
              }
            }
          }
          Section("Your matches") {
            if store.matches.isEmpty {
              Text(
                store.loading
                  ? "Loading schedule…"
                  : "No assignments yet. Ask your scouting lead to assign a shift.")
            }
            ForEach(store.displayedMatches) { match in
              NavigationLink {
                MatchReminderView(store: store, match: match)
              } label: {
                MatchRow(match: match)
                  .opacity(store.remainingMatches.contains(where: { $0.id == match.id }) ? 1 : 0.5)
              }
            }
          }
          Section {
            Toggle(
              "5-minute reminders",
              isOn: Binding(
                get: { store.remindersEnabled },
                set: { enabled in Task { await store.setReminders(enabled) } }
              ))
            Text(
              "Uses the latest published match time. Tap a match to set your own time. Updates may arrive late offline."
            )
            .font(.caption2).foregroundStyle(.secondary)
          }
        } else {
          Section {
            VStack(alignment: .leading, spacing: 8) {
              Image(systemName: "iphone.and.arrow.forward")
                .font(.largeTitle).foregroundStyle(.purple)
              Text("Open Collection on your iPhone")
                .font(.headline)
              Text(
                "Finish setup and select your name and tournament. Your schedule will sync here."
              )
              .font(.caption)
            }
          }
        }
        if let error = store.error {
          Text(error).font(.caption).foregroundStyle(.orange)
        }
        Button {
          store.foreground()
        } label: {
          if store.loading {
            ProgressView()
          } else {
            Label("Refresh", systemImage: "arrow.clockwise")
          }
        }.disabled(store.loading)
      }
      .navigationTitle("Lovat")
      .tint(.purple)
    }
  }
}

private struct MatchRow: View {
  let match: WatchMatch

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(match.label).font(.headline)
      Text("Team \(match.team)").font(.title3).bold()
      Label(match.alliance.capitalized, systemImage: "circle.fill")
        .foregroundStyle(match.alliance == "red" ? .red : .blue)
        .font(.caption)
      if let time = match.startTime {
        Text(time, style: .time).font(.caption)
        if match.manualTime != nil {
          Text("Your time").font(.caption2).foregroundStyle(.secondary)
        } else if match.predictedTime != nil {
          Text("Estimated").font(.caption2).foregroundStyle(.secondary)
        }
      } else {
        Text("Time unavailable").font(.caption2).foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct MatchReminderView: View {
  @ObservedObject var store: WatchStore
  let match: WatchMatch
  @State private var time = Date().addingTimeInterval(600)
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    Form {
      MatchRow(match: match)
      DatePicker(
        "Match starts", selection: $time, in: Date()...,
        displayedComponents: [.date, .hourAndMinute])
      Text("Remind me 5 minutes before this time. Update it if the event is delayed.")
        .font(.caption)
      Button("Save reminder") {
        Task {
          await store.setReminders(true)
          await store.setManualTime(time, for: match)
          dismiss()
        }
      }
      if store.manualTimes[match.id] != nil {
        Button("Remove my time", role: .destructive) {
          Task {
            await store.setManualTime(nil, for: match)
            dismiss()
          }
        }
      }
    }
    .navigationTitle(match.label)
    .onAppear {
      time = max(match.startTime ?? Date().addingTimeInterval(600), Date().addingTimeInterval(60))
    }
  }
}

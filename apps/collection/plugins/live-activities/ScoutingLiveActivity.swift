import ActivityKit
import SwiftUI
import WidgetKit

private let lovatPurple = Color(red: 53.0 / 255, green: 8.0 / 255, blue: 104.0 / 255)

@main
struct CollectionLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    ScoutingLiveActivity()
    if #available(iOS 17.0, *) {
      ScoutingDemoWidget()
    }
  }
}

struct ScoutingLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ScoutingActivityAttributes.self) { context in
      ActivityContents(state: context.state, stale: context.isStale, preview: context.attributes.preview)
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "lovat-collection://home"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          ActivityContents(state: context.state, stale: context.isStale, preview: context.attributes.preview)
        }
      } compactLeading: {
        ScoutingLogo(size: 27)
          .frame(width: 27, height: 27)
          .accessibilityLabel("Lovat scouting")
      } compactTrailing: {
        Text(context.isStale ? "…" : context.state.assignments.first?.matchLabel ?? "—")
          .font(.system(size: 20, weight: .medium))
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          .monospacedDigit()
          .accessibilityLabel(context.isStale ? "Open Collection to refresh" : "Next match " + (context.state.assignments.first?.matchLabel ?? ""))
      } minimal: {
        ScoutingLogo(size: 27).padding(2)
      }
      .contentMargins(.bottom, 16, for: .expanded)
      .keylineTint(lovatPurple)
      .widgetURL(URL(string: "lovat-collection://home"))
    }
  }
}

private struct ActivityContents: View {
  let state: ScoutingActivityAttributes.ContentState
  let stale: Bool
  let preview: Bool

  var body: some View {
    VStack(spacing: 4) {
      if preview { Text("Preview").font(.caption2).foregroundStyle(.secondary) }
      if stale {
        Text("Open Collection to refresh")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      HStack(alignment: .center, spacing: 12) {
        ScoutingLogo(size: 50)
          .accessibilityHidden(true)

        if let next = state.assignments.first {
          if state.phase == "waiting" {
            VStack(alignment: .leading, spacing: 6) {
              Text("Now").font(.system(size: 16))
              Text(state.nowMatch).font(.system(size: 20, weight: .medium))
            }
            Rectangle().fill(Color.white.opacity(0.25)).frame(width: 1, height: 40)
            VStack(alignment: .leading, spacing: 6) {
              Text("Next Shift").font(.system(size: 16))
              HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(next.matchLabel).font(.system(size: 20, weight: .medium))
                if let time = state.nextStartTime {
                  Text(Date(timeIntervalSince1970: time), style: .time)
                    .font(.system(size: 16)).foregroundStyle(.secondary)
                    .lineLimit(1).minimumScaleFactor(0.75)
                }
              }
            }.frame(maxWidth: .infinity, alignment: .leading)
          } else {
            VStack(alignment: .leading, spacing: 6) {
              Text("Next match").font(.system(size: 14)).foregroundStyle(.secondary)
              AssignmentRow(assignment: next, prominent: true)
            }.frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
              ForEach(Array(state.assignments.dropFirst().prefix(3)), id: \.matchKey) { assignment in
                AssignmentRow(assignment: assignment, prominent: false)
              }
            }
          }
        }
      }
      .foregroundStyle(.white)
      .monospacedDigit()
    }
  }
}

private struct ScoutingLogo: View {
  let size: CGFloat

  var body: some View {
    Image(size <= 27 ? "ScoutingBinoculars" : "ScoutingBinocularsExpanded")
      .resizable()
      .frame(width: size, height: size)
  }
}

private struct AssignmentRow: View {
  let assignment: ScoutingActivityAttributes.Assignment
  let prominent: Bool

  var body: some View {
    HStack(spacing: 7) {
      Text(assignment.matchLabel)
      Rectangle().fill(.white.opacity(0.25)).frame(width: 1, height: prominent ? 20 : 14)
      Text(String(assignment.teamNumber)).foregroundStyle(prominent ? Color.white : Color.gray)
    }
    .font(.system(size: prominent ? 20 : 14, weight: .medium))
    .lineLimit(1)
    .minimumScaleFactor(0.75)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(assignment.matchLabel), scout team \(assignment.teamNumber)")
  }
}

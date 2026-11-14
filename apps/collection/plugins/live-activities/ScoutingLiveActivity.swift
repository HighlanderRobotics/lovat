import ActivityKit
import SwiftUI
import WidgetKit

private let lovatPurple = Color(red: 53.0 / 255, green: 8.0 / 255, blue: 104.0 / 255)

@main
struct CollectionLiveActivityBundle: WidgetBundle {
  var body: some Widget { ScoutingLiveActivity() }
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
        CompactScoutingIcon(waiting: context.state.phase == "waiting")
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
        CompactScoutingIcon(waiting: context.state.phase == "waiting").padding(2)
      }
      // The before-shift row needs clearance from the island's rounded bottom.
      // Only the on-shift mascot is designed to sit flush with that edge.
      .contentMargins(.bottom, context.state.phase == "waiting" ? 16 : 0, for: .expanded)
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
        if state.phase == "waiting" {
          Image("ScoutingBinocularsExpanded")
            .resizable()
            .frame(width: 50, height: 50)
            .accessibilityHidden(true)
        } else {
          ScoutingMascot(faceOnly: false)
            .frame(width: 80, height: 108)
            .accessibilityHidden(true)
        }

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

private struct CompactScoutingIcon: View {
  let waiting: Bool

  var body: some View {
    if waiting {
      Image("ScoutingBinoculars").resizable().frame(width: 27, height: 27)
    } else {
      ScoutingMascot(faceOnly: true)
    }
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

// Original vector artwork exported from the approved Figma designs.
private struct ScoutingMascot: View {
  let faceOnly: Bool

  var body: some View {
    GeometryReader { geometry in
      if faceOnly {
        Image("ScoutingFace")
          .resizable()
          .frame(width: geometry.size.width * 35.294 / 27,
                 height: geometry.size.height * 45.882 / 27)
          .offset(x: geometry.size.width * -4.15 / 27,
                  y: geometry.size.height * -2.03 / 27)
      } else {
        VStack(spacing: 0) {
          Spacer(minLength: 0)
          Image("ScoutingMascot")
            .resizable()
            .aspectRatio(80.0 / 104.0, contentMode: .fit)
        }
      }
    }
    .clipShape(MascotBadge(faceOnly: faceOnly))
  }
}

private struct MascotBadge: Shape {
  let faceOnly: Bool
  func path(in rect: CGRect) -> Path {
    if faceOnly { return Path(ellipseIn: rect) }
    let radius = rect.width / 2
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
    path.addArc(center: CGPoint(x: rect.midX, y: rect.minY + radius), radius: radius, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

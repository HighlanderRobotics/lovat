import AppIntents
import CoreText
import SwiftUI
import WidgetKit

@available(iOS 17.0, *)
enum ScoutingDemoPhase: String, AppEnum {
  case waiting
  case onShift

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Shift state"
  static var caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .waiting: "Before shift",
    .onShift: "On scout",
  ]
}

@available(iOS 17.0, *)
struct ScoutingDemoConfiguration: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Scouting demo"
  static var description = IntentDescription("Preview sample scouting data. This widget does not show real assignments.")

  @Parameter(title: "Shift state", default: .waiting)
  var phase: ScoutingDemoPhase
}

struct ScoutingWidgetDemoData: Decodable {
  let nowMatch: String
  let currentTeam: Int
  let nextMatch: String
  let nextTeam: Int
  let nextTime: String
  let blue: [Int]
  let red: [Int]

  static let sample: Self? = {
    guard let url = Bundle.main.url(forResource: "widget-demo", withExtension: "json"),
          let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(Self.self, from: data)
  }()
}

@available(iOS 17.0, *)
struct ScoutingDemoEntry: TimelineEntry {
  let date: Date
  let phase: ScoutingDemoPhase
}

@available(iOS 17.0, *)
struct ScoutingDemoProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> ScoutingDemoEntry {
    ScoutingDemoEntry(date: .now, phase: .waiting)
  }

  func snapshot(for configuration: ScoutingDemoConfiguration, in context: Context) async -> ScoutingDemoEntry {
    ScoutingDemoEntry(date: .now, phase: configuration.phase)
  }

  func timeline(for configuration: ScoutingDemoConfiguration, in context: Context) async -> Timeline<ScoutingDemoEntry> {
    // Sample data is intentionally static, so it never pretends to be fresh
    // competition data or asks the scout to reopen Collection for a refresh.
    Timeline(entries: [ScoutingDemoEntry(date: .now, phase: configuration.phase)], policy: .never)
  }
}

@available(iOS 17.0, *)
struct ScoutingDemoWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "ScoutingDemoWidget", intent: ScoutingDemoConfiguration.self, provider: ScoutingDemoProvider()) { entry in
      ScoutingDemoWidgetView(active: entry.phase == .onShift)
        .containerBackground(.black, for: .widget)
        .environment(\.colorScheme, .dark)
        .widgetURL(URL(string: "lovat-collection://widget-demo"))
    }
    .configurationDisplayName("Scouting demo")
    .description("Sample scouting assignments in small and medium layouts. Edit the widget to change the shift state.")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

private enum ScoutingWidgetFont {
  static let registered: Bool = {
    guard let url = Bundle.main.url(forResource: "Heebo-Medium", withExtension: "ttf") else { return false }
    return CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  }()

  static func match(_ size: CGFloat) -> Font {
    _ = registered
    return .custom("Heebo-Medium", size: size)
  }
}

private struct ScoutingDemoWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let active: Bool

  var body: some View {
    Group {
      if let data = ScoutingWidgetDemoData.sample {
        if family == .systemSmall {
          small(data)
        } else {
          medium(data)
        }
      } else {
        Text("Widget demo unavailable. Reinstall Collection.")
          .font(.caption)
          .padding()
      }
    }
    .foregroundStyle(.white)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Sample scouting widget")
  }

  private var secondary: Color { Color(.secondaryLabel).opacity(0.7) }

  private func label(_ value: String, size: CGFloat = 16) -> some View {
    Text(value)
      .font(.system(size: size, weight: .medium))
      .foregroundStyle(secondary)
      .lineLimit(1)
  }

  private func logo(_ size: CGFloat) -> some View {
    Image("ScoutingBinocularsExpanded")
      .resizable()
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }

  private func match(_ number: String, team: Int? = nil) -> some View {
    HStack(spacing: 6) {
      Text(number).font(.system(size: 20, weight: .medium))
      if let team {
        Rectangle().fill(.white.opacity(0.3)).frame(width: 1, height: 18)
        label(String(team), size: 14)
      }
    }
    .frame(height: 24)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
  }

  private func time(_ data: ScoutingWidgetDemoData) -> some View {
    Text(data.nextTime)
      .font(.system(size: 16, weight: .medium))
      .foregroundStyle(.white.opacity(0.6))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
  }

  private var divider: some View {
    Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
  }

  private func now(_ data: ScoutingWidgetDemoData) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      label("Now").frame(height: 22)
      match(data.nowMatch, team: active ? data.currentTeam : nil)
    }
  }

  private func small(_ data: ScoutingWidgetDemoData) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        logo(32)
        now(data)
      }
      .frame(height: 50)
      divider
      VStack(alignment: .leading, spacing: 2) {
        label(active ? "Next match" : "Next Shift", size: active ? 14 : 16)
          .frame(height: active ? 20 : 22)
        match(data.nextMatch, team: data.nextTeam)
        time(data).frame(height: 22)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .padding(12)
  }

  private func medium(_ data: ScoutingWidgetDemoData) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(spacing: active ? 12 : 18) {
        logo(40)
        now(data)
        Rectangle().fill(.white.opacity(0.25)).frame(width: 1, height: 40)
        VStack(alignment: .leading, spacing: 4) {
          if active {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              label("Next match", size: 14)
              time(data)
            }.frame(height: 22)
            match(data.nextMatch, team: data.nextTeam)
          } else {
            label("Next Shift").frame(height: 22)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              match(data.nextMatch)
              time(data)
            }.frame(height: 24)
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
      }.frame(height: 50)
      divider
      matchCard(data)
    }
    .frame(maxHeight: .infinity, alignment: .top)
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }

  private func matchCard(_ data: ScoutingWidgetDemoData) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Text(data.nextMatch).font(ScoutingWidgetFont.match(14))
        Text("Next · Scouting \(String(data.nextTeam))")
          .font(ScoutingWidgetFont.match(10))
          .tracking(0.4)
          .foregroundStyle(Color("WidgetAccent"))
          .padding(.horizontal, 7)
          .padding(.vertical, 5)
          .background(Color("WidgetBadge"), in: RoundedRectangle(cornerRadius: 5))
        Spacer(minLength: 0)
      }
      .frame(height: 25)
      .padding(.horizontal, 10)
      alliance(data.blue, color: Color("WidgetBlueAlliance"))
      alliance(data.red, color: Color("WidgetRedAlliance"))
    }
    .foregroundStyle(Color("WidgetMatchText"))
    .background(Color("WidgetCard"))
    .clipShape(RoundedRectangle(cornerRadius: 7))
  }

  private func alliance(_ teams: [Int], color: Color) -> some View {
    HStack(spacing: 0) {
      ForEach(Array(teams.enumerated()), id: \.offset) { index, team in
        Text(String(team))
          .frame(maxWidth: .infinity, alignment: index == 0 ? .leading : index == 1 ? .center : .trailing)
      }
    }
    .font(ScoutingWidgetFont.match(16))
    .frame(height: 28)
    .padding(.horizontal, 10)
    .background(color)
  }
}

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import demo from "../../plugins/live-activities/widget-demo.json";

export type WidgetDemoPhase = "waiting" | "onShift";
export type WidgetDemoSize = "small" | "medium";

export const widgetDemoDimensions = {
  small: { width: 170, height: 170 },
  medium: { width: 364, height: 170 },
} as const;

const c = demo.colors;

function MatchSummary({ match, team }: { match: string; team?: number }) {
  return (
    <View style={styles.matchSummary}>
      <Text style={styles.match}>{match}</Text>
      {team !== undefined && (
        <>
          <View style={styles.teamDivider} />
          <Text style={styles.team}>{team}</Text>
        </>
      )}
    </View>
  );
}

/** Sample-only preview of the same layouts installed in the iOS widget gallery. */
export function ScoutingWidgetPreview({
  phase,
  size,
}: {
  phase: WidgetDemoPhase;
  size: WidgetDemoSize;
}) {
  const active = phase === "onShift";
  const small = size === "small";
  const label = active ? "Next match" : "Next Shift";
  const time = <Text style={styles.time}>{demo.nextTime}</Text>;
  const now = (
    <View style={styles.summaryColumn}>
      <Text style={styles.label}>Now</Text>
      <MatchSummary
        match={demo.nowMatch}
        team={active ? demo.currentTeam : undefined}
      />
    </View>
  );
  const logo = (
    <Image
      source={require("../../plugins/live-activities/Assets.xcassets/ScoutingBinocularsExpanded.imageset/binoculars.png")}
      style={{ width: small ? 32 : 40, height: small ? 32 : 40 }}
      accessibilityLabel="Lovat binoculars"
    />
  );

  return (
    <View
      testID="scouting-widget-preview"
      style={[
        styles.widget,
        widgetDemoDimensions[size],
        small ? styles.small : styles.medium,
      ]}
    >
      <View style={[styles.header, { gap: small || active ? 12 : 18 }]}>
        {logo}
        {now}
        {!small && (
          <>
            <View style={styles.headerDivider} />
            <View style={styles.nextColumn}>
              {active ? (
                <>
                  <View style={styles.nextHeading}>
                    <Text style={styles.nextLabel}>{label}</Text>
                    {time}
                  </View>
                  <MatchSummary match={demo.nextMatch} team={demo.nextTeam} />
                </>
              ) : (
                <>
                  <Text style={styles.label}>{label}</Text>
                  <View style={styles.nextHeading}>
                    <MatchSummary match={demo.nextMatch} />
                    {time}
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </View>
      <View style={styles.divider} />
      {small ? (
        <View style={styles.smallNext}>
          <Text style={active ? styles.nextLabel : styles.label}>{label}</Text>
          <MatchSummary match={demo.nextMatch} team={demo.nextTeam} />
          {time}
        </View>
      ) : (
        <View style={styles.card} testID="widget-alliance-table">
          <View style={styles.cardHeader}>
            <Text style={styles.cardMatch}>{demo.nextMatch}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Next · Scouting {demo.nextTeam}
              </Text>
            </View>
          </View>
          {(["blue", "red"] as const).map((alliance) => (
            <View
              key={alliance}
              style={[
                styles.alliance,
                {
                  backgroundColor:
                    alliance === "blue"
                      ? c.WidgetBlueAlliance
                      : c.WidgetRedAlliance,
                },
              ]}
            >
              {demo[alliance].map((number, index) => (
                <Text
                  key={number}
                  style={[
                    styles.allianceTeam,
                    {
                      textAlign:
                        index === 0 ? "left" : index === 1 ? "center" : "right",
                    },
                  ]}
                >
                  {number}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  widget: { backgroundColor: "#000", borderRadius: 28, overflow: "hidden" },
  small: { padding: 12 },
  medium: { paddingHorizontal: 14, paddingVertical: 12, gap: 7 },
  header: { flexDirection: "row", alignItems: "center", height: 50 },
  summaryColumn: { gap: 4 },
  nextColumn: { flex: 1, gap: 4 },
  label: {
    color: "rgba(235,235,245,0.49)",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  nextLabel: {
    color: "rgba(235,235,245,0.49)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  matchSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 24,
  },
  match: { color: "#fff", fontSize: 20, lineHeight: 24, fontWeight: "500" },
  team: {
    color: "rgba(235,235,245,0.49)",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
  time: { color: "#fff9", fontSize: 16, lineHeight: 22, fontWeight: "500" },
  teamDivider: { width: 1, height: 18, backgroundColor: "#ffffff4d" },
  headerDivider: { width: 1, height: 40, backgroundColor: "#ffffff40" },
  divider: { height: 1, backgroundColor: "#fff3", alignSelf: "stretch" },
  nextHeading: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  smallNext: { flex: 1, gap: 2 },
  card: { borderRadius: 7, overflow: "hidden", backgroundColor: c.WidgetCard },
  cardHeader: {
    height: 25,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  cardMatch: {
    fontFamily: "Heebo_500Medium",
    fontSize: 14,
    lineHeight: 20,
    color: c.WidgetMatchText,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: c.WidgetBadge,
  },
  badgeText: {
    fontFamily: "Heebo_500Medium",
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.4,
    color: c.WidgetAccent,
  },
  alliance: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  allianceTeam: {
    flex: 1,
    fontFamily: "Heebo_500Medium",
    fontSize: 16,
    lineHeight: 24,
    color: c.WidgetMatchText,
  },
});

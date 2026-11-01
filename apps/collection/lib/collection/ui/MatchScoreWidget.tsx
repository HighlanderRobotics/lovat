import { Text, View } from "react-native";
import { colors } from "../../colors";
import { useReportStateStore } from "../reportStateStore";
import { totalScoredPoints } from "../matchScore";

/**
 * Live score for the robot being scouted. It updates as scoring events are
 * recorded, so a scout can sanity-check the total before the match ends.
 */
export function MatchScoreWidget() {
  const events = useReportStateStore((state) => state.events);
  const points = totalScoredPoints(events);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${points} points scored`}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
        backgroundColor: colors.gray.default,
        borderRadius: 7,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          color: colors.onBackground.default,
          fontFamily: "Heebo_500Medium",
          fontSize: 18,
          lineHeight: 22,
        }}
      >
        {points}
      </Text>
      <Text
        style={{
          color: colors.body.default,
          fontFamily: "Heebo_500Medium",
          fontSize: 10,
        }}
      >
        PTS
      </Text>
    </View>
  );
}

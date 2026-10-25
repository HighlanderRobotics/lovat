import React from "react";
import { View } from "react-native";
import Button from "../../components/Button";
import BodyMedium from "../../components/text/BodyMedium";
import type { ScoutReportMeta } from "../../models/ScoutReportMeta";
import {
  localizeMatchIdentity,
  MatchIdentityLocalizationFormat,
} from "../../models/match";

export function SubmissionActions({
  nextMatch,
  onNext,
  onHome,
}: {
  nextMatch: ScoutReportMeta | null;
  onNext: () => void;
  onHome: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      {nextMatch && (
        <>
          <View style={{ alignItems: "center" }}>
            <BodyMedium>
              {nextMatch.teamNumber} in{" "}
              {localizeMatchIdentity(
                nextMatch.matchIdentity,
                MatchIdentityLocalizationFormat.Long,
              )}
            </BodyMedium>
          </View>
          <Button variant="primary" onPress={onNext}>
            Scout Next Match
          </Button>
        </>
      )}
      <Button variant="primary" onPress={onHome}>
        Go to Home
      </Button>
    </View>
  );
}

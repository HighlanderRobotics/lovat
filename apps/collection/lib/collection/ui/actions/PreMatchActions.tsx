import { useReportStateStore } from "../../reportStateStore";
import { TouchableOpacity } from "react-native";
import { MatchEventPosition } from "../../MatchEventPosition";
import { FieldElement } from "../FieldElement";
import { StartingPosition } from "../../ReportState";
import React from "react";
import { useTrainingSessionStore } from "../../../training/trainingStore";
import { figmaDimensionsToFieldInsets } from "../../util";

export const PreMatchActions = () => {
  const reportState = useReportStateStore();
  const training = useTrainingSessionStore();
  const poseEnabled =
    !reportState.meta?.collection?.trainingAttemptUuid ||
    (training.connected &&
      training.snapshot?.status === "ARMED" &&
      !training.snapshot.participants[0]?.ready);

  const buttonPositions: Array<{
    position: StartingPosition;
    edgeInsets: [number, number, number, number];
  }> = [
    {
      position: MatchEventPosition.LeftTrench,
      edgeInsets: figmaDimensionsToFieldInsets({
        x: 104,
        y: 8,
        width: 60,
        height: 53,
      }),
    },
    {
      position: MatchEventPosition.LeftBump,
      edgeInsets: figmaDimensionsToFieldInsets({
        x: 104,
        y: 65,
        width: 60,
        height: 72,
      }),
    },
    {
      position: MatchEventPosition.Hub,
      edgeInsets: figmaDimensionsToFieldInsets({
        x: 104,
        y: 141,
        width: 60,
        height: 54,
      }),
    },
    {
      position: MatchEventPosition.RightBump,
      edgeInsets: figmaDimensionsToFieldInsets({
        x: 104,
        y: 199,
        width: 60,
        height: 72,
      }),
    },
    {
      position: MatchEventPosition.RightTrench,
      edgeInsets: figmaDimensionsToFieldInsets({
        x: 104,
        y: 275,
        width: 60,
        height: 53,
      }),
    },
  ];

  return (
    <>
      {buttonPositions.map(({ position, edgeInsets }) => (
        <FieldElement key={position} edgeInsets={edgeInsets}>
          <TouchableOpacity
            disabled={!poseEnabled}
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#e0e0e0",
              opacity: reportState.startPosition === position ? 0.8 : 0.3,
              borderRadius: 7,
            }}
            activeOpacity={0.2}
            onPress={() => {
              reportState.setStartPosition(position);
            }}
          />
        </FieldElement>
      ))}
    </>
  );
};

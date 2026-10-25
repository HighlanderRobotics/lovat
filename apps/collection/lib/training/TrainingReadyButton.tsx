import { useState } from "react";
import { View, Alert } from "react-native";
import { router } from "expo-router";
import Button from "../components/Button";
import BodyMedium from "../components/text/BodyMedium";
import { useTrainingSessionStore } from "./trainingStore";
import { useReportStateStore } from "../collection/reportStateStore";
import { syncReportLifecycle } from "../lovatAPI/reportLifecycle";
import { useUrlPrefix } from "../lovatAPI/lovatAPI";

export function TrainingReadyButton() {
  const training = useTrainingSessionStore();
  const report = useReportStateStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = training.snapshot?.participants[0]?.ready;
  const credentials = training.credentials;
  return (
    <View style={{ maxWidth: 300, gap: 5 }}>
      <Button
        density="compact"
        disabled={
          busy ||
          ready ||
          !training.connected ||
          report.startPosition === undefined ||
          !!training.error
        }
        onPress={async () => {
          if (!credentials || !report.uuid || !report.meta) return;
          setBusy(true);
          setError("");
          try {
            await syncReportLifecycle(report.uuid, report.meta);
            const response = await fetch(
              `${useUrlPrefix.getState().getUrlPrefix()}/collection/training/sessions/${credentials.sessionUuid}/ready`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${credentials.token}`,
                },
                body: JSON.stringify({ attemptUuid: credentials.attemptUuid }),
              },
            );
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.displayError);
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not mark ready.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {!training.connected
          ? "Reconnecting…"
          : ready
            ? "Ready · waiting for video"
            : report.startPosition === undefined
              ? "Choose a starting position"
              : "Ready"}
      </Button>
      {(error || training.error) && (
        <BodyMedium>{error || training.error}</BodyMedium>
      )}
      <Button
        density="compact"
        variant="secondary"
        onPress={() =>
          Alert.alert(
            "Leave training?",
            "Your unsubmitted attempt will be discarded.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Leave",
                style: "destructive",
                onPress: () => {
                  useTrainingSessionStore.getState().clear();
                  useReportStateStore.getState().reset();
                  router.replace("/home");
                },
              },
            ],
          )
        }
      >
        Leave training
      </Button>
    </View>
  );
}

import { useLocalSearchParams, router, Stack } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import Button from "../../lib/components/Button";
import Heading1Small from "../../lib/components/text/Heading1Small";
import BodyMedium from "../../lib/components/text/BodyMedium";
import TextField from "../../lib/components/TextField";
import {
  useScouterStore,
  useTeamStore,
  useFieldOrientationStore,
  FieldOrientation,
} from "../../lib/storage/userStores";
import { post } from "../../lib/lovatAPI/lovatAPI";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { useTrainingSessionStore } from "../../lib/training/trainingStore";
import { AllianceColor } from "../../lib/models/AllianceColor";
import { MatchType } from "../../lib/models/match";
import { useCustomPostMatchStore } from "../../lib/storage/customPostMatchStore";

export default function JoinTraining() {
  const params = useLocalSearchParams<{ session?: string; token?: string }>();
  const scout = useScouterStore((state) => state.value);
  const team = useTeamStore((state) => state.number);
  const [deviceName, setDeviceName] = useState(`${Platform.OS} device`);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = z
    .object({ session: z.string().uuid(), token: z.string().min(32).max(100) })
    .safeParse(params);
  const active = useReportStateStore((state) => state.uuid);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Stack.Screen
        options={{ orientation: "portrait", title: "Join training" }}
      />
      <ScrollView contentContainerStyle={{ padding: 26, gap: 20 }}>
        <Heading1Small>Join training</Heading1Small>
        <BodyMedium>
          Everyone scouts the same robot. Your training report is kept separate
          from competition data.
        </BodyMedium>
        {!valid.success ? (
          <BodyMedium>
            This training QR code is invalid. Scan a new code on the website.
          </BodyMedium>
        ) : !scout || team === null ? (
          <View style={{ gap: 15 }}>
            <BodyMedium>
              Select your team and scout in Collection, then scan the QR code
              again.
            </BodyMedium>
            <Button onPress={() => router.replace("/home")}>
              Choose scout
            </Button>
          </View>
        ) : (
          <>
            <BodyMedium>
              {scout.name} · Team {team}
            </BodyMedium>
            <TextField
              value={deviceName}
              accessibilityLabel="Device name"
              maxLength={80}
              onChangeText={setDeviceName}
              placeholder="Device name (for the website roster)"
            />
            {active ? (
              <BodyMedium>
                You have a report open. Finish or discard it before joining a
                training session.
              </BodyMedium>
            ) : (
              <Button
                disabled={busy || !deviceName.trim()}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const response = await post(
                      `/collection/train/${valid.data.session}`,
                      {
                        pairingToken: valid.data.token,
                        deviceName: deviceName.trim(),
                      },
                    );
                    const data = await response.json();
                    if (!response.ok)
                      throw new Error(
                        data.displayError ?? "Could not join training.",
                      );
                    const video = data.snapshot.video;
                    if (video.gameYear !== 2023)
                      throw new Error(
                        "This Collection build requires a Charged Up training exercise.",
                      );
                    useFieldOrientationStore
                      .getState()
                      .setValue(FieldOrientation.Auspicious);
                    useReportStateStore.getState().scoutMatch(
                      {
                        scouterUUID: scout.uuid,
                        teamNumber: video.teamNumber,
                        allianceColor: video.alliance as AllianceColor,
                        matchIdentity: {
                          tournamentKey: video.tournamentKey,
                          matchType:
                            video.matchType === "QUALIFICATION"
                              ? MatchType.Qualifier
                              : video.matchType === "PRACTICE"
                                ? MatchType.Practice
                                : MatchType.Elimination,
                          matchNumber: video.matchNumber,
                        },
                        collection: {
                          sourceTeamNumber: team,
                          trainingAttemptUuid: data.attemptUuid,
                          trainingSessionUuid: valid.data.session,
                        },
                      },
                      useCustomPostMatchStore.getState().getQuestions(),
                    );
                    if (data.reportUuid)
                      useReportStateStore.setState({ uuid: data.reportUuid });
                    useTrainingSessionStore.getState().set({
                      credentials: {
                        sessionUuid: valid.data.session,
                        attemptUuid: data.attemptUuid,
                        token: data.attemptToken,
                        reportUuid: useReportStateStore.getState().uuid!,
                      },
                      snapshot: data.snapshot,
                      error: null,
                    });
                    router.replace("/game");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not join training.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Join & prepare →
              </Button>
            )}
          </>
        )}
        {!!error && <BodyMedium>{error}</BodyMedium>}
      </ScrollView>
    </SafeAreaView>
  );
}

import { ActivityIndicator, LayoutAnimation, View } from "react-native";
import { NavBar } from "../../lib/components/NavBar";
import { colors } from "../../lib/colors";
import { SafeAreaView } from "react-native-safe-area-context";
import BodyMedium from "../../lib/components/text/BodyMedium";
import Button from "../../lib/components/Button";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import {
  MatchIdentityLocalizationFormat,
  localizeMatchIdentity,
} from "../../lib/models/match";
import { Suspense, useEffect, useState } from "react";
import { ScoutReport } from "../../lib/collection/ScoutReport";
import { router, useNavigation } from "expo-router";
import { uploadReport } from "../../lib/lovatAPI/uploadReport";
import { Icon } from "../../lib/components/Icon";
import { useHistoryStore } from "../../lib/storage/historyStore";
import { ScoutReportMeta } from "../../lib/models/ScoutReportMeta";
import { ScoutReportCode } from "../../lib/collection/ui/ScoutReportCode";
import { CommonActions } from "@react-navigation/native";
import React from "react";
import { useScouterScheduleStore } from "../../lib/services";
import {
  useScouterStore,
  useTournamentStore,
} from "../../lib/storage/userStores";
import { nextScouterAssignment } from "../../lib/collection/nextScouterAssignment";
import { SubmissionActions } from "../../lib/collection/ui/SubmissionActions";
import { useTrainingSessionStore } from "../../lib/training/trainingStore";
import { useCustomPostMatchStore } from "../../lib/storage/customPostMatchStore";

export default function Submit() {
  // Keep this submission fixed while the next match initializes the live store.
  const [submission] = useState(() => {
    const state = useReportStateStore.getState();
    return state.meta
      ? { meta: state.meta, scoutReport: state.exportScoutReport() }
      : null;
  });
  const scoutReport = submission?.scoutReport;
  const meta = submission?.meta;

  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);

  const [uploadState, setUploadState] = useState(UploadState.None);

  const upsertMatchToHistory = useHistoryStore((state) => state.upsertMatch);

  useEffect(() => {
    if (uploading) {
      setUploadState(UploadState.Uploading);
    } else if (uploaded) {
      setUploadState(UploadState.Uploaded);
    } else if (uploadError?.message === "Scout report already uploaded") {
      setUploadState(UploadState.AlreadyUploaded);
    } else if (uploadError?.message == "Match does not exist") {
      setUploadState(UploadState.WrongMatchMeta);
    } else if (uploadError) {
      setUploadState(UploadState.Error);
    } else {
      setUploadState(UploadState.None);
    }
  }, [uploaded, uploading, uploadError]);

  useEffect(() => {
    if (scoutReport && !uploaded && !uploading && !uploadError) {
      upsertMatchToHistory(scoutReport, false, meta!);
      setUploading(true);

      uploadReport(scoutReport, meta)
        .then(() => {
          setUploading(false);
          setUploaded(true);
          upsertMatchToHistory(scoutReport, true, meta!);
        })
        .catch((e) => {
          console.error(e);
          setUploading(false);
          setUploadError(e);
          upsertMatchToHistory(scoutReport, false, meta!);
        });
    }
  }, [scoutReport]);

  if (!meta) return null;

  return (
    <>
      <NavBar
        title={`${meta.teamNumber} in ${localizeMatchIdentity(meta.matchIdentity, MatchIdentityLocalizationFormat.Short)}`}
      />
      <SafeAreaView
        edges={["bottom", "left", "right"]}
        style={{
          flex: 1,
          gap: 7,
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <View style={{ flex: 1, paddingVertical: 16, maxWidth: 450 }}>
          {scoutReport && !meta.collection?.trainingSessionUuid && (
            <ScoutReportCode scoutReport={scoutReport} />
          )}

          <View style={{ paddingHorizontal: 26, flex: 1 }}>
            <UploadIndicator state={uploadState} />
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
              }}
            >
              <Suspense
                fallback={
                  <Button variant="primary" disabled>
                    Done
                  </Button>
                }
              >
                {scoutReport && (
                  <DoneButton
                    scoutReport={scoutReport!}
                    uploadState={uploadState}
                    meta={meta}
                  />
                )}
              </Suspense>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const DoneButton = ({
  scoutReport,
  uploadState,
  meta,
}: {
  scoutReport: ScoutReport;
  uploadState: UploadState;
  meta: ScoutReportMeta;
}) => {
  const resetReportState = useReportStateStore((state) => state.reset);
  const upsertMatchToHistory = useHistoryStore((state) => state.upsertMatch);
  const navigation = useNavigation();
  const schedule = useScouterScheduleStore((state) => state.data);
  const history = useHistoryStore((state) => state.history);
  const scouter = useScouterStore((state) => state.value);
  const tournament = useTournamentStore((state) => state.value);
  const nextMatch =
    scouter?.uuid === meta.scouterUUID &&
    tournament?.key === meta.matchIdentity.tournamentKey
      ? nextScouterAssignment(schedule, meta, history)
      : null;
  const preserveSubmission = () =>
    upsertMatchToHistory(
      scoutReport,
      uploadState === UploadState.Uploaded ||
        uploadState === UploadState.AlreadyUploaded,
      meta,
    );

  return (
    <SubmissionActions
      nextMatch={meta.collection?.trainingSessionUuid ? null : nextMatch}
      onNext={() => {
        if (!nextMatch) return;
        preserveSubmission();
        useReportStateStore
          .getState()
          .scoutMatch(
            nextMatch,
            useCustomPostMatchStore.getState().getQuestions(),
          );
        router.replace("/game");
      }}
      onHome={() => {
        preserveSubmission();
        useTrainingSessionStore.getState().clear();
        resetReportState();
        navigation.dispatch(
          CommonActions.reset({
            routes: [{ key: "index", name: "index" }],
          }),
        );
      }}
    />
  );
};

enum UploadState {
  None,
  Uploading,
  Uploaded,
  AlreadyUploaded,
  WrongMatchMeta,
  Error,
}

const UploadIndicatorInner = ({ state }: { state: UploadState }) => {
  switch (state) {
    case UploadState.None:
      return null;
    case UploadState.Uploading:
      return <BodyMedium>Uploading</BodyMedium>;
    case UploadState.Uploaded:
      return <BodyMedium>Uploaded</BodyMedium>;
    case UploadState.AlreadyUploaded:
      return <BodyMedium>Already uploaded</BodyMedium>;
    case UploadState.Error:
      return (
        <BodyMedium color={colors.danger.default}>Upload failed</BodyMedium>
      );
    case UploadState.WrongMatchMeta:
      return (
        <BodyMedium color={colors.danger.default}>
          Match does not exist
        </BodyMedium>
      );
  }
};

const UploadIndicator = ({ state }: { state: UploadState }) => {
  const [effectiveState, setEffectiveState] = useState(state);

  useEffect(() => {
    if (state === effectiveState) return;

    LayoutAnimation.configureNext({
      duration: 500,
      create: {
        type: "linear",
        property: "opacity",
        duration: 200,
      },
      update: {
        type: "spring",
        springDamping: 0.6,
      },
      delete: {
        type: "linear",
        property: "opacity",
        duration: 200,
      },
    });
    setEffectiveState(state);
  }, [state]);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          marginTop: 14,
          paddingVertical: 4,
          paddingLeft: 7,
          paddingRight: effectiveState === UploadState.None ? 7 : 10,
          borderRadius: 100,
          backgroundColor: colors.secondaryContainer.default,
          justifyContent: "center",
          alignItems: "center",
          gap: effectiveState === UploadState.Uploading ? 6 : 2,
          flexDirection: "row",
          height: 30,
          minWidth: 30,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 18,
            width: 18,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {effectiveState === UploadState.None ||
            (effectiveState === UploadState.Uploading && (
              <ActivityIndicator
                size="small"
                color={colors.onBackground.default}
              />
            ))}
          {(effectiveState === UploadState.Uploaded ||
            effectiveState == UploadState.AlreadyUploaded) && (
            <Icon name="check" color="#44ca6c" size={16} />
          )}
          {(effectiveState === UploadState.Error ||
            effectiveState === UploadState.WrongMatchMeta) && (
            <Icon name="error" color={colors.danger.default} size={16} />
          )}
        </View>
        <UploadIndicatorInner state={effectiveState} />
      </View>
    </View>
  );
};

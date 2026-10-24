import React, { useState } from "react";
import { Alert, View } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Slider from "@react-native-community/slider";
import { NavBar } from "../../lib/components/NavBar";
import Button from "../../lib/components/Button";
import LabelSmall from "../../lib/components/text/LabelSmall";
import BodyMedium from "../../lib/components/text/BodyMedium";
import TextField from "../../lib/components/TextField";
import { Checkbox } from "../../lib/components/Checkbox";
import { Picker } from "../../lib/components/Picker";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { PostMatchData } from "../../lib/collection/ChargedUp";
import { driverAbilityDescriptions } from "../../lib/collection/DriverAbility";
import { useTrainingModeStore } from "../../lib/storage/userStores";
import { colors } from "../../lib/colors";

export default function PostMatch() {
  const state = useReportStateStore();
  const training = useTrainingModeStore((s) => s.value);
  const [links, setLinks] = useState(String(state.links));
  const set = state.setPostMatch;
  const validLinks = /^\d+$/.test(links) && Number.isSafeInteger(Number(links));
  if (!state.meta) return null;
  return (
    <>
      <Stack.Screen
        options={{
          orientation: "portrait_up",
          animationDuration: 0,
          animation: "flip",
        }}
      />
      <NavBar title="Post match" />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: "center",
          paddingVertical: 16,
          paddingHorizontal: 26,
        }}
        bottomOffset={48}
        keyboardDismissMode="interactive"
      >
        <SafeAreaView
          edges={["bottom", "left", "right"]}
          style={{ width: "100%", gap: 14, maxWidth: 550 }}
        >
          <View style={{ gap: 7 }}>
            <LabelSmall>Roles performed</LabelSmall>
            <Picker
              style="inset-picker"
              multiSelect
              options={
                [
                  { value: "OFFENCE", label: "Offence" },
                  { value: "DEFENCE", label: "Defence" },
                  { value: "FEEDING", label: "Feeding" },
                  { value: "IMMOBILE", label: "Immobile" },
                ] as {
                  value: PostMatchData["robotRoles"][number];
                  label: string;
                }[]
              }
              selected={state.robotRoles}
              onChange={(value) =>
                set({
                  robotRoles: state.robotRoles.includes(value)
                    ? state.robotRoles.filter((r) => r !== value)
                    : [...state.robotRoles, value],
                })
              }
            />
          </View>
          <View style={{ gap: 7 }}>
            <LabelSmall>Driver ability</LabelSmall>
            <Picker
              style="inset-picker"
              options={driverAbilityDescriptions.map((d) => ({
                value: d.numericalRating,
                label: d.localizedDescription,
                description: d.localizedLongDescription,
              }))}
              selected={state.driverAbility}
              onChange={(driverAbility) => set({ driverAbility })}
            />
          </View>
          <RatingSlider
            label="Defence effectiveness"
            value={state.defenseEffectiveness}
            min={1}
            max={5}
            onChange={(defenseEffectiveness) => set({ defenseEffectiveness })}
          />
          <RatingSlider
            label="Active vs camping defence"
            value={state.activeDefensePercentage}
            min={0}
            max={100}
            onChange={(activeDefensePercentage) =>
              set({ activeDefensePercentage })
            }
            suffix="% active"
          />
          <Choice
            label="Intake sources"
            values={["GROUND", "STATION", "BOTH", "NEITHER"] as const}
            selected={state.intakeType}
            onChange={(intakeType) => set({ intakeType })}
          />
          <Choice
            label="Game pieces they can intake"
            values={["CONE", "CUBE", "BOTH", "NEITHER"] as const}
            selected={state.intakePieces}
            onChange={(intakePieces) => set({ intakePieces })}
          />
          <Choice
            label="Paths into alliance zone"
            values={["MIDDLE", "TOP", "BOTH", "NEITHER"] as const}
            selected={state.mobility}
            onChange={(mobility) => set({ mobility })}
          />
          <Choice
            label="Endgame result"
            values={["NOT_ATTEMPTED", "FAILED", "SUCCEEDED"] as const}
            selected={state.endgameResult}
            onChange={(endgameResult) => set({ endgameResult })}
          />
          <Checkbox
            label="Alliance achieved coopertition"
            checked={state.coopertition}
            onChange={(coopertition) => set({ coopertition })}
          />
          <View style={{ gap: 7 }}>
            <LabelSmall>Links scored by the whole alliance</LabelSmall>
            <TextField
              placeholder="Alliance links scored"
              keyboardType="number-pad"
              value={links}
              onChangeText={(text) => {
                setLinks(text);
                if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text)))
                  set({ links: Number(text) });
              }}
            />
            {!validLinks && (
              <BodyMedium>Enter a non-negative whole number.</BodyMedium>
            )}
          </View>
          <Checkbox
            label="Robot broke"
            checked={state.robotBrokeDescription !== null}
            onChange={(checked) =>
              set({ robotBrokeDescription: checked ? "" : null })
            }
          />
          {state.robotBrokeDescription !== null && (
            <TextField
              multiline
              placeholder="How did it break?"
              value={state.robotBrokeDescription}
              onChangeText={(robotBrokeDescription) =>
                set({ robotBrokeDescription })
              }
            />
          )}
          <View style={{ gap: 7 }}>
            <LabelSmall>Notes</LabelSmall>
            <TextField
              multiline
              value={state.notes}
              onChangeText={(notes) => set({ notes })}
            />
            <BodyMedium>
              Keep it helpful. Notes can be viewed by anyone.
            </BodyMedium>
          </View>
          <Button
            variant="primary"
            disabled={training || !validLinks}
            onPress={() => router.replace("/game/submit")}
          >
            Submit
          </Button>
          <Button
            variant="secondary"
            onPress={() =>
              Alert.alert(
                "Discard match?",
                "You will lose all of the data that you recorded.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Discard",
                    style: "destructive",
                    onPress: () => {
                      state.reset();
                      router.replace("/home");
                    },
                  },
                ],
              )
            }
          >
            Discard match
          </Button>
          {training && (
            <BodyMedium>
              Disable training mode in settings to submit data.
            </BodyMedium>
          )}
        </SafeAreaView>
      </KeyboardAwareScrollView>
    </>
  );
}
function Choice<T extends string>({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 7 }}>
      <LabelSmall>{label}</LabelSmall>
      <Picker<string>
        style="inset-picker"
        selected={selected}
        onChange={(value) => onChange(value as T)}
        options={values.map((value) => ({
          value,
          label: value
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/^./, (c) => c.toUpperCase()),
        }))}
      />
    </View>
  );
}
function RatingSlider({
  label,
  value,
  min,
  max,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <LabelSmall>
        {label}: {value} {suffix}
      </LabelSmall>
      <Slider
        accessibilityLabel={label}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.victoryPurple.default}
        maximumTrackTintColor={colors.gray.default}
        thumbTintColor={colors.onBackground.default}
      />
    </View>
  );
}

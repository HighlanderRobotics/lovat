import {
  robotRoleOptions,
  toggleRobotRole,
} from "../../lib/collection/robotRoles";
import { defenseEffectivenessDescriptions } from "../../lib/collection/DefenseEffectiveness";
import React, { useEffect, useState } from "react";
import { Alert, View, Text } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Slider from "@react-native-community/slider";
import { NavBar } from "../../lib/components/NavBar";
import Button from "../../lib/components/Button";
import BodyMedium from "../../lib/components/text/BodyMedium";
import TextField from "../../lib/components/TextField";
import { Checkbox } from "../../lib/components/Checkbox";
import { Picker, PickerOption } from "../../lib/components/Picker";
import { useReportStateStore } from "../../lib/collection/reportStateStore";
import { driverAbilityDescriptions } from "../../lib/collection/DriverAbility";
import { useTrainingModeStore } from "../../lib/storage/userStores";
import { colors } from "../../lib/colors";

export default function PostMatch() {
  const state = useReportStateStore();
  const training = useTrainingModeStore((s) => s.value);
  const [links, setLinks] = useState(String(state.links));
  const set = state.setPostMatch;
  useEffect(() => {
    useReportStateStore.getState().preparePostMatch();
  }, []);
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
            <QuestionLabel>Roles performed</QuestionLabel>
            <BodyMedium>
              Select every role performed, or No show if the robot did not
              appear.
            </BodyMedium>
            <Picker
              style="inset-picker"
              multiSelect
              options={robotRoleOptions}
              selected={state.robotRoles}
              onChange={(value) =>
                set({
                  robotRoles: toggleRobotRole(state.robotRoles, value),
                })
              }
            />
          </View>
          <View style={{ gap: 7 }}>
            <QuestionLabel>Driver ability</QuestionLabel>
            <BodyMedium>
              Rate how consistently the driver controlled and positioned this
              robot, from 1 to 5.
            </BodyMedium>
            <Picker
              style="inset-picker"
              options={driverAbilityDescriptions.map((d) => ({
                value: d.numericalRating,
                label: `${d.numericalRating} · ${d.localizedDescription}`,
                description: d.localizedLongDescription,
              }))}
              selected={state.driverAbility}
              onChange={(driverAbility) => set({ driverAbility })}
            />
          </View>
          <View style={{ gap: 7 }}>
            <QuestionLabel>Defence effectiveness</QuestionLabel>
            <Picker
              style="inset-picker"
              selected={state.defenseEffectiveness}
              onChange={(defenseEffectiveness) => set({ defenseEffectiveness })}
              options={defenseEffectivenessDescriptions.map((d) => ({
                value: d.num + 1,
                label: `${d.num + 1} · ${d.localizedDescription}`,
                description: d.localizedLongDescription,
              }))}
            />
          </View>
          <RatingSlider
            label="Active vs camping defence"
            caption="Estimate the share of defence spent actively following or blocking opponents. 0% means all camping; 100% means all active."
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
            label="Game pieces"
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
          <View style={{ gap: 7 }}>
            <Checkbox
              label="Alliance achieved coopertition"
              checked={state.coopertition}
              onChange={(coopertition) => set({ coopertition })}
            />
          </View>
          <View style={{ gap: 7 }}>
            <QuestionLabel>Links scored by the whole alliance</QuestionLabel>
            <BodyMedium>
              Count all links completed by the alliance. A link is three
              adjacent scored nodes in the same row.
            </BodyMedium>
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
          <View style={{ gap: 7 }}>
            <Checkbox
              label="Robot broke"
              checked={state.robotBrokeDescription !== null}
              onChange={(checked) =>
                set({ robotBrokeDescription: checked ? "" : null })
              }
            />
          </View>
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
            <QuestionLabel>Notes</QuestionLabel>
            <TextField
              multiline
              value={state.notes}
              onChangeText={(notes) => set({ notes })}
            />
            <BodyMedium>
              Describe useful observations about this robot that the other
              answers do not cover. Keep it helpful; notes can be viewed by
              anyone.
            </BodyMedium>
          </View>
          {state.customPostMatch.map(({ question, answer }, index) => (
            <View key={question} style={{ gap: 7 }}>
              <QuestionLabel>{question}</QuestionLabel>
              <TextField
                multiline
                accessibilityLabel={question}
                placeholder="Answer (optional)"
                maxLength={2000}
                value={answer}
                onChangeText={(value) =>
                  state.setCustomPostMatchAnswer(index, value)
                }
              />
            </View>
          ))}
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
      <QuestionLabel>{label}</QuestionLabel>
      <Picker
        style="vertical-group"
        label={label}
        selected={selected}
        onChange={onChange}
        options={values.map(
          (value) => ({ value, label: choiceLabel(value) }) as PickerOption<T>,
        )}
      />
    </View>
  );
}
function choiceLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
function RatingSlider({
  label,
  caption,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  caption: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <QuestionLabel>
        {label}: {value} {suffix}
      </QuestionLabel>
      <BodyMedium>{caption}</BodyMedium>
      <View
        style={{
          backgroundColor: colors.secondaryContainer.default,
          borderRadius: 10,
          padding: 12,
          overflow: "hidden",
        }}
      >
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
    </View>
  );
}

function QuestionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: "Heebo_500Medium",
        fontSize: 16,
        color: colors.onBackground.default,
      }}
    >
      {children}
    </Text>
  );
}

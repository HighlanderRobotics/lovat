import { Platform, Pressable, Text, View } from "react-native";
import { colors } from "../colors";
import { Key } from "react";
import Button from "./Button";
import * as Haptics from "expo-haptics";
import BodyMedium from "./text/BodyMedium";
import LabelSmall from "./text/LabelSmall";
import { SelectionIndicator } from "./Checkbox";

type UnkeyedPickerOption<T> = {
  label: string;
  description?: string;
  value: T;
  key?: undefined;
  disabled?: boolean;
};

type KeyedPickerOption<T> = UnkeyedPickerOption<T> & { key: Key };

export type PickerOption<T> =
  | (T extends Key ? UnkeyedPickerOption<T> : KeyedPickerOption<T>)
  | (KeyedPickerOption<T> & { disabled?: boolean });

type PickerProps<T> = {
  label?: string;
  options: PickerOption<T>[];
  selected: T | T[];
  onChange: (value: T) => void;
  multiSelect?: boolean;
  style?: PickerStyle;
};

export type PickerStyle =
  | "horizontal-group"
  | "vertical-group"
  | "inset-picker";

export function Picker<T = string>(props: PickerProps<T>) {
  const {
    options,
    selected,
    onChange,
    multiSelect = false,
    style = "horizontal-group",
    label,
  } = props;

  const isSelected = (value: T) => {
    if (multiSelect && Array.isArray(selected)) {
      return selected.includes(value);
    }
    return value === selected;
  };

  if (style === "vertical-group") {
    return (
      <View
        accessibilityRole={multiSelect ? undefined : "radiogroup"}
        accessibilityLabel={label}
        style={{
          backgroundColor: colors.gray.hover,
          borderRadius: 7,
          overflow: "hidden",
          gap: 2,
        }}
      >
        {options.map((option) => (
          <Pressable
            key={option.key ?? option.value}
            accessibilityRole={multiSelect ? "checkbox" : "radio"}
            accessibilityLabel={option.label}
            aria-checked={isSelected(option.value)}
            accessibilityState={{
              checked: isSelected(option.value),
              disabled: option.disabled,
            }}
            disabled={option.disabled}
            onPress={() => {
              if (Platform.OS === "ios")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(option.value);
            }}
            style={({ pressed }) => ({
              minHeight: 46,
              paddingVertical: 11,
              paddingHorizontal: 20,
              justifyContent: "center",
              backgroundColor: isSelected(option.value)
                ? colors.victoryPurple.default
                : pressed
                  ? colors.gray.hover
                  : colors.gray.default,
            })}
          >
            <Text
              style={{
                fontFamily: "Heebo_500Medium",
                fontSize: 16,
                lineHeight: 24,
                textAlign: "center",
                color: option.disabled
                  ? colors.gray.hover
                  : isSelected(option.value)
                    ? colors.background.default
                    : colors.onBackground.default,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  } else if (style === "inset-picker") {
    return (
      <View
        style={{
          borderRadius: 10,
          overflow: "hidden",
          paddingVertical: 8,
          backgroundColor: colors.secondaryContainer.default,
        }}
      >
        {options.map((option) => (
          <Pressable
            key={option.key ?? option.value}
            accessibilityRole={multiSelect ? "checkbox" : "radio"}
            accessibilityLabel={option.label}
            aria-checked={isSelected(option.value)}
            accessibilityState={{
              checked: isSelected(option.value),
              disabled: option.disabled,
            }}
            disabled={option.disabled}
            onPress={() => {
              if (Platform.OS === "ios")
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(option.value);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              paddingLeft: 14,
              paddingRight: 18,
              paddingVertical: 6,
              backgroundColor: pressed ? colors.gray.default : "transparent",
            })}
          >
            <SelectionIndicator
              type={multiSelect ? "checkbox" : "radio"}
              selected={isSelected(option.value)}
              disabled={option.disabled}
            />
            <View style={{ flex: 1 }}>
              <LabelSmall
                color={
                  option.disabled
                    ? colors.gray.hover
                    : colors.onBackground.default
                }
              >
                {option.label}
              </LabelSmall>
              {option.description && (
                <BodyMedium
                  color={
                    option.disabled ? colors.gray.hover : colors.body.default
                  }
                >
                  {option.description}
                </BodyMedium>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    );
  } else if (style === "horizontal-group") {
    return (
      <View
        style={{
          flexDirection: "row",
          gap: 2,
          backgroundColor: colors.gray.hover,
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        {options.map((option) => {
          return (
            <Button
              key={option.key ?? option.value}
              flex={1}
              borderRadius={0}
              variant={isSelected(option.value) ? "primary" : "secondary"}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(option.value);
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </View>
    );
  }
}

import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { colors } from "../colors";
import LabelSmall from "./text/LabelSmall";
import Svg, { Path } from "react-native-svg";

export const Checkbox = (props: {
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) => {
  const { label, checked, onChange } = props;

  return (
    <Pressable
      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      onPress={() => {
        onChange?.(!checked);
      }}
      role="checkbox"
      aria-checked={checked}
    >
      <SelectionIndicator type="checkbox" selected={checked ?? false} />
      <View style={{ flexShrink: 1 }}>
        <LabelSmall color={colors.body.default}>{label}</LabelSmall>
      </View>
    </Pressable>
  );
};

type SelectionIndicatorProps = {
  type: "checkbox" | "radio";
  selected: boolean;
  disabled?: boolean;
};

export const SelectionIndicator = (props: SelectionIndicatorProps) => {
  const unCheckedStyle: StyleProp<ViewStyle> = {
    backgroundColor: colors.secondaryContainer.default,
    borderColor: props.disabled ? colors.gray.faded : colors.gray.default,
    borderWidth: 2,
  };

  const checkedStyle: StyleProp<ViewStyle> = {
    backgroundColor: props.disabled
      ? colors.victoryPurple.faded
      : colors.victoryPurple.default,
  };

  return (
    <View
      style={[
        props.selected ? checkedStyle : unCheckedStyle,
        {
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: props.type === "checkbox" ? 5 : 12,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      {props.selected && props.type === "checkbox" && (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M5 12l4 4L19 6"
            fill="none"
            stroke={colors.background.default}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
      {props.selected && props.type === "radio" && (
        <View
          style={{
            height: 8,
            width: 8,
            borderRadius: 4,
            backgroundColor: colors.background.default,
          }}
        />
      )}
    </View>
  );
};

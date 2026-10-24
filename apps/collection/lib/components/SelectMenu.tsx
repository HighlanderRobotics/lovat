import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../colors";

type Anchor = { x: number; y: number; width: number; height: number };

// The 2025 spacious dropdown: a bordered field and an equally wide, animated menu.
export function SelectMenu<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);
  const rowHeight = Math.max(40, 24 * window.fontScale + 16);
  const desiredHeight = options.length * rowHeight;
  const availableBelow = anchor
    ? window.height - insets.bottom - anchor.y - anchor.height - 8
    : 0;
  const availableAbove = anchor ? anchor.y - insets.top - 8 : 0;
  const above =
    availableBelow < desiredHeight && availableAbove > availableBelow;
  const menuHeight = Math.min(
    desiredHeight,
    Math.max(0, above ? availableAbove : availableBelow),
  );

  useEffect(() => {
    if (!anchor) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.stopAnimation();
  }, [anchor, progress]);
  useEffect(() => {
    setAnchor(null);
  }, [window.width, window.height]);

  const open = () => {
    Keyboard.dismiss();
    trigger.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) setAnchor({ x, y, width, height });
    });
  };
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? "Select"}`}
        accessibilityState={{ expanded: anchor !== null }}
        onPress={open}
        style={[
          styles.field,
          { borderColor: anchor ? colors.gray.hover : colors.gray.default },
        ]}
      >
        <Text
          style={[
            styles.text,
            { flex: 1, color: selected ? "#cccccc" : "#828282" },
          ]}
        >
          {selected?.label ?? "Select"}
        </Text>
        <Image
          source={require("../../assets/ui/select-chevron.png")}
          resizeMode="contain"
          style={{
            width: 12.5,
            height: 6.25,
            transform: [{ rotate: anchor ? "180deg" : "0deg" }],
          }}
        />
      </Pressable>
      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        onRequestClose={() => setAnchor(null)}
        supportedOrientations={["portrait", "landscape"]}
      >
        <View
          style={{ flex: 1 }}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setAnchor(null)}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`Close ${label} menu`}
            onPress={() => setAnchor(null)}
          />
          {anchor && (
            <Animated.View
              accessibilityRole="menu"
              accessibilityLabel={label}
              style={{
                position: "absolute",
                left: Math.max(
                  insets.left + 4,
                  Math.min(
                    anchor.x,
                    window.width - insets.right - anchor.width - 4,
                  ),
                ),
                width: anchor.width,
                ...(above
                  ? { bottom: window.height - anchor.y + 4 }
                  : { top: anchor.y + anchor.height + 4 }),
                height: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, menuHeight],
                }),
                backgroundColor: colors.secondaryContainer.default,
                borderRadius: 7,
                overflow: "hidden",
                shadowColor: "#000000",
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {options.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="menuitem"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: option.value === value }}
                    onPress={() => {
                      onChange(option.value);
                      setAnchor(null);
                    }}
                    style={({ pressed }) => ({
                      minHeight: rowHeight,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      justifyContent: "center",
                      backgroundColor:
                        option.value === value
                          ? colors.victoryPurple.default
                          : pressed
                            ? colors.gray.default
                            : colors.secondaryContainer.default,
                    })}
                  >
                    <Text
                      style={[
                        styles.text,
                        {
                          color:
                            option.value === value
                              ? colors.background.default
                              : "#cccccc",
                          fontFamily:
                            option.value === value
                              ? "Heebo_500Medium"
                              : "Heebo_400Regular",
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          )}
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderRadius: 7,
    backgroundColor: colors.secondaryContainer.default,
  },
  text: { fontFamily: "Heebo_400Regular", fontSize: 16, lineHeight: 24 },
});

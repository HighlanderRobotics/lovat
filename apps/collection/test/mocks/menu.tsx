// The OS-owned menu presentation is replaced, while app menu callbacks stay real.
import React from "react";
import { Pressable, Text, View } from "react-native";
export function Root({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}
export const Trigger = Root,
  Content = Root;
export function Item({
  children,
  onSelect,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      disabled={disabled}
      onPress={onSelect}
    >
      {children}
    </Pressable>
  );
}
export function ItemTitle({ children }: { children: React.ReactNode }) {
  return <Text>{children}</Text>;
}
export function ItemIcon() {
  return null;
}

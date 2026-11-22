import React, { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "./IconButton";
import Button from "./Button";
import TitleMedium from "./text/TitleMedium";
import { colors } from "../colors";

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon="menu"
        label="Open sidebar"
        color={colors.onBackground.default}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{ flex: 1, flexDirection: "row", backgroundColor: "#0008" }}
        >
          <SafeAreaView
            style={{ width: 280, backgroundColor: colors.background.default }}
          >
            <View style={{ padding: 24, gap: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <TitleMedium>Collection</TitleMedium>
                <IconButton
                  icon="close"
                  label="Close sidebar"
                  color={colors.onBackground.default}
                  onPress={() => setOpen(false)}
                />
              </View>
              {[
                { label: "History", path: "/history" as const },
                { label: "Settings", path: "/settings" as const },
                { label: "Debug", path: "/debug" as const },
              ].map((item) => (
                <Button
                  key={item.path}
                  filled={false}
                  onPress={() => {
                    setOpen(false);
                    router.push(item.path);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </View>
          </SafeAreaView>
          <Pressable
            accessibilityLabel="Dismiss sidebar"
            style={{ flex: 1 }}
            onPress={() => setOpen(false)}
          />
        </View>
      </Modal>
    </>
  );
}

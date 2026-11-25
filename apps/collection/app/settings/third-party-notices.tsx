import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import notices from "../../assets/fonts/third-party-notices.json";
import { colors } from "../../lib/colors";
import { IconButton } from "../../lib/components/IconButton";
import { NavBar } from "../../lib/components/NavBar";
import BodyMedium from "../../lib/components/text/BodyMedium";

export default function ThirdPartyNotices() {
  return (
    <>
      <NavBar
        title="Third-Party Notices"
        left={
          <IconButton
            icon="arrow_back_ios"
            label="Back"
            onPress={() => router.back()}
            color={colors.onBackground.default}
          />
        }
      />
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
          {[
            { title: "Heebo", text: notices.heebo },
            {
              title: "Material Symbols Rounded",
              text: notices.materialSymbols,
            },
          ].map(({ title, text }) => (
            <View key={title} style={{ gap: 8 }}>
              <Text
                accessibilityRole="header"
                style={{
                  color: colors.onBackground.default,
                  fontFamily: "Heebo_500Medium",
                  fontSize: 20,
                }}
              >
                {title}
              </Text>
              <BodyMedium selectable>{text}</BodyMedium>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

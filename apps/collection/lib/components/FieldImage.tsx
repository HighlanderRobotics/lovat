import React from "react";
import { Image, View, StyleSheet } from "react-native";
import {
  FieldOrientation,
  useFieldOrientationStore,
} from "../storage/userStores";

export const fieldWidth = 822;
export const fieldHeight = 304;

export const FieldImage = () => {
  const fieldOrientation = useFieldOrientationStore((state) => state.value);

  return (
    <View
      style={[
        styles.container,
        {
          transform: [
            {
              rotate:
                fieldOrientation === FieldOrientation.Auspicious
                  ? "0deg"
                  : "180deg",
            },
          ],
        },
      ]}
    >
      <Image
        source={require("../../assets/charged-up/field.png")}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

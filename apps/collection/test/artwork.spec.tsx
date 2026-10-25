import React from "react";
import { render, screen } from "@testing-library/react-native";
import Hub from "../assets/hub";
import Back from "../assets/hexagon/Back";
import Blue from "../assets/hexagon/BlueSide";
import Red from "../assets/hexagon/RedSide";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import {
  useFieldOrientationStore,
  FieldOrientation,
} from "../lib/storage/userStores";
import { AllianceColor } from "../lib/models/AllianceColor";
import { meta } from "./fixtures";
it.each([AllianceColor.Blue, AllianceColor.Red])(
  "legacy artwork remains available for %s report history",
  (allianceColor) => {
    useReportStateStore.getState().scoutMatch({ ...meta, allianceColor });
    useFieldOrientationStore
      .getState()
      .setValue(
        allianceColor === AllianceColor.Blue
          ? FieldOrientation.Auspicious
          : FieldOrientation.Sinister,
      );
    render(
      <>
        <Hub />
        <Back />
        <Blue />
        <Red />
      </>,
    );
    expect(screen.toJSON()).toBeTruthy();
  },
);

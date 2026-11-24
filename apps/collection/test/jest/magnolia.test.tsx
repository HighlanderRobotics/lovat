import React, { createRef } from "react";
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { MagnoliaProvider } from "@highlanderrobotics/magnolia-react-native";
import TextField from "../../lib/components/TextField";
import BodyMedium from "../../lib/components/text/BodyMedium";
import { colors } from "../../lib/colors";

test("shared fields retain Collection's multiline behavior, refs and callbacks", async () => {
  const change = jest.fn();
  const ref = createRef<TextInput>();
  await render(
    <MagnoliaProvider mode="dark">
      <TextField
        ref={ref}
        placeholder="Match notes"
        multiline
        value=""
        onChangeText={change}
      />
    </MagnoliaProvider>,
  );
  const input = screen.getByLabelText("Match notes");
  expect(input.props.submitBehavior).toBe("newline");
  expect(input.props.scrollEnabled).toBe(false);
  expect(ref.current).toBeTruthy();
  await fireEvent.changeText(input, "Scored in auto");
  expect(change).toHaveBeenCalledWith("Scored in auto");
});

test("shared fields retain single-line submission and disabled state", async () => {
  await render(
    <MagnoliaProvider mode="dark">
      <TextField placeholder="Team" editable={false} />
    </MagnoliaProvider>,
  );
  const input = screen.getByLabelText("Team");
  expect(input.props.submitBehavior).toBe("blurAndSubmit");
  expect(input.props.editable).toBe(false);
});

test("text wrappers retain bundled fonts and semantic colors", async () => {
  await render(
    <MagnoliaProvider mode="dark">
      <BodyMedium>Report caption</BodyMedium>
    </MagnoliaProvider>,
  );
  expect(screen.getByText("Report caption")).toHaveStyle({
    fontFamily: "Heebo_400Regular",
    color: colors.body.default,
    fontSize: 14,
  });
});

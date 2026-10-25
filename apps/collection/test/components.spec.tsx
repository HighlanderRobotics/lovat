import React from "react";
import { TextInput, TouchableOpacity, Platform } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import Button from "../lib/components/Button";
import { Checkbox, SelectionIndicator } from "../lib/components/Checkbox";
import TextField from "../lib/components/TextField";
import { Picker, type PickerOption } from "../lib/components/Picker";
import { Icon } from "../lib/components/Icon";
import { IconButton } from "../lib/components/IconButton";
import { FieldImage } from "../lib/components/FieldImage";
import TitleLarge from "../lib/components/text/TitleLarge";
import TitleMedium from "../lib/components/text/TitleMedium";
import LabelSmall from "../lib/components/text/LabelSmall";
import {
  useFieldOrientationStore,
  FieldOrientation,
} from "../lib/storage/userStores";
import { colors } from "../lib/colors";

it.each(["primary", "secondary", "danger"] as const)(
  "%s buttons distinguish disabled, pressed, loading, and error states",
  async (variant) => {
    let finish: () => void = () => {};
    const action = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(
      <Button variant={variant} onPress={action} loadingChildren="Saving">
        Save
      </Button>,
    );
    const button = screen.UNSAFE_getByType(TouchableOpacity);
    fireEvent(button, "pressIn");
    fireEvent(button, "pressOut");
    fireEvent.press(button);
    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Saving")).toBeTruthy());
    expect(screen.UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
    await act(async () => finish());
    expect(screen.getByText("Save")).toBeTruthy();
    view.rerender(
      <Button
        variant={variant}
        density="compact"
        filled={false}
        onPress={async () => {
          throw new Error("Try again");
        }}
      >
        Retry
      </Button>,
    );
    fireEvent.press(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    view.rerender(
      <Button variant={variant} disabled>
        Disabled
      </Button>,
    );
    expect(screen.UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
    view.rerender(
      <Button
        variant={variant}
        filled={false}
        borderRadius={11}
        backgroundColorSet={colors.gray}
      >
        No action
      </Button>,
    );
    fireEvent.press(screen.getByText("No action"));
    view.rerender(
      <Button variant={variant} onPress={() => {}}>
        Sync
      </Button>,
    );
    fireEvent.press(screen.getByText("Sync"));
  },
);
test("async button loading falls back to its normal label", async () => {
  let finish: () => void = () => {};
  render(
    <Button
      filled={false}
      onPress={() =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      }
    >
      Continue
    </Button>,
  );
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() =>
    expect(screen.UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true),
  );
  expect(screen.getByText("Continue")).toBeTruthy();
  await act(async () => finish());
});
test("checkboxes expose their selected state and optional change callback", () => {
  const change = jest.fn();
  const view = render(
    <Checkbox label="Coopertition" checked onChange={change} />,
  );
  fireEvent.press(screen.getByRole("checkbox"));
  expect(change).toHaveBeenCalledWith(false);
  view.rerender(<Checkbox label="Optional" />);
  fireEvent.press(screen.getByRole("checkbox"));
  for (const type of ["checkbox", "radio"] as const)
    for (const selected of [true, false])
      for (const disabled of [true, false]) {
        view.rerender(
          <SelectionIndicator
            type={type}
            selected={selected}
            disabled={disabled}
          />,
        );
        expect(screen.toJSON()).toBeTruthy();
      }
});
test("text fields retain input, use the correct submission mode, and report focus changes", () => {
  const focus = jest.fn(),
    blur = jest.fn(),
    change = jest.fn(),
    submit = jest.fn();
  const view = render(
    <TextField
      accessibilityLabel="Notes"
      onFocus={focus}
      onBlur={blur}
      onChangeText={change}
      onSubmitEditing={submit}
    />,
  );
  let input = screen.getByLabelText("Notes");
  fireEvent(input, "focus");
  expect(focus).toHaveBeenCalledTimes(1);
  expect(input.props.style.borderColor).toBe(colors.gray.hover);
  fireEvent.changeText(input, "Recovered quickly");
  expect(change).toHaveBeenCalledWith("Recovered quickly");
  fireEvent(input, "submitEditing");
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent(input, "blur");
  expect(blur).toHaveBeenCalledTimes(1);
  view.rerender(
    <TextField density="compact" editable={false} multiline value="Saved" />,
  );
  input = screen.UNSAFE_getByType(TextInput);
  expect(input.props.submitBehavior).toBe("newline");
  expect(input.props.style.color).toBe("#535353");
  fireEvent(input, "focus");
  fireEvent(input, "blur");
  view.rerender(<TextField error />);
  expect(screen.UNSAFE_getByType(TextInput).props.style.borderColor).toBe(
    colors.danger.default,
  );
});
it.each(["vertical-group", "inset-picker", "horizontal-group"] as const)(
  "%s picker supports selected, unselected, disabled and pressed choices",
  (style) => {
    const change = jest.fn();
    const options: PickerOption<string>[] = [
      { value: "one", label: "One", description: "First" },
      {
        value: "two",
        label: "Two",
        description: "Not available",
        disabled: true,
      },
      { value: "three", label: "Three", key: "stable" },
    ];
    const view = render(
      <Picker
        style={style}
        options={options}
        selected="one"
        onChange={change}
      />,
    );
    if (style === "horizontal-group") {
      fireEvent.press(screen.getByText("One"));
      expect(change).toHaveBeenCalledWith("one");
    } else {
      const option = screen.getByRole("radio", { name: "One" });
      fireEvent.press(option);
      expect(change).toHaveBeenCalledWith("one");
      expect(
        screen.getByRole("radio", { name: "Two" }).props.accessibilityState
          .disabled,
      ).toBe(true);
      const third = screen.getByRole("radio", { name: "Three" });
      const thirdPressable = screen.UNSAFE_root.findAll(
        (node) => typeof node.props.style === "function",
      ).find((node) => node.props.accessibilityLabel === "Three")!;
      const firstPressable = screen.UNSAFE_root.findAll(
        (node) => typeof node.props.style === "function",
      ).find((node) => node.props.accessibilityLabel === "One")!;
      const base = thirdPressable.props.style({ pressed: false }),
        pressed = thirdPressable.props.style({ pressed: true });
      expect(base.backgroundColor).not.toBe(pressed.backgroundColor);
      expect(firstPressable.props.style({ pressed: true })).toBeTruthy();
      const old = Platform.OS;
      Object.defineProperty(Platform, "OS", {
        value: "android",
        configurable: true,
      });
      fireEvent.press(third);
      Object.defineProperty(Platform, "OS", { value: old, configurable: true });
    }
    view.rerender(
      <Picker
        style={style}
        options={options}
        selected={["one", "three"]}
        multiSelect
        onChange={change}
      />,
    );
    if (style !== "horizontal-group")
      fireEvent.press(screen.getByRole("checkbox", { name: "Three" }));
  },
);
test("icons and image buttons preserve accessible labels and disabled behavior", () => {
  const press = jest.fn();
  const view = render(<IconButton icon="undo" label="Undo" onPress={press} />);
  fireEvent.press(screen.getByLabelText("Undo"));
  expect(press).toHaveBeenCalledTimes(1);
  view.rerender(
    <IconButton icon="undo" image={1} label="Disabled" disabled size={40} />,
  );
  expect(screen.getByLabelText("Disabled")).toBeDisabled();
  view.rerender(<IconButton icon="undo" image={1} label="Default size" />);
  for (const name of ["frc_coral", "frc_algae", "feeder", "home"])
    for (const size of [undefined, 24, 40, 48, 19]) {
      view.rerender(<Icon name={name} size={size} />);
      expect(screen.toJSON()).toBeTruthy();
    }
});
it.each([TitleLarge, TitleMedium, LabelSmall])(
  "text styles preserve their explicit color and default color",
  (Component) => {
    const view = render(<Component>Heading</Component>);
    expect(screen.getByText("Heading").props.style.color).toBe(
      colors.onBackground.default,
    );
    view.rerender(<Component color="red">Heading</Component>);
    expect(screen.getByText("Heading").props.style.color).toBe("red");
  },
);
it.each([FieldOrientation.Auspicious, FieldOrientation.Sinister])(
  "field artwork follows orientation %s",
  (orientation) => {
    act(() => {
      useFieldOrientationStore.getState().setValue(orientation);
    });
    render(<FieldImage />);
    expect(screen.toJSON()).toBeTruthy();
  },
);

test("picker disabled captions retain their disabled styling", () => {
  render(
    <Picker
      options={[
        {
          value: "blocked",
          label: "Unavailable",
          description: "Not available",
          disabled: true,
        },
      ]}
      selected="blocked"
      style="inset-picker"
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("Not available")).toHaveStyle({
    color: colors.gray.hover,
  });
});

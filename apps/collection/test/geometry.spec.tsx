import React from "react";
import { Text, PanResponder } from "react-native";
import { act, render, renderHook, screen } from "@testing-library/react-native";
import { FieldElement } from "../lib/collection/ui/FieldElement";
import { GameAction } from "../lib/collection/ui/GameAction";
import { useFieldRelativeDimensions } from "../lib/collection/useFieldRelativeDimensions";
import {
  FieldOrientation,
  useFieldOrientationStore,
} from "../lib/storage/userStores";
import { AllianceColor } from "../lib/models/AllianceColor";
import { useReportStateStore } from "../lib/collection/reportStateStore";
import { figmaDimensionsToFieldInsets } from "../lib/collection/util";
import { meta } from "./fixtures";
import { DraggableContainer } from "../lib/collection/ui/DraggableContainer";
import { GamePhase } from "../lib/collection/ReportState";

const insets: [number, number, number, number] = [0.1, 0.2, 0.3, 0.4];
const combos = [FieldOrientation.Auspicious, FieldOrientation.Sinister].flatMap(
  (orientation) =>
    [AllianceColor.Blue, AllianceColor.Red].flatMap((allianceColor) =>
      [true, false].map((respectAlliance) => ({
        orientation,
        allianceColor,
        respectAlliance,
      })),
    ),
);
it.each(combos)(
  "field insets respect $allianceColor/$orientation and respectAlliance=$respectAlliance",
  ({ orientation, allianceColor, respectAlliance }) => {
    useReportStateStore.getState().scoutMatch({ ...meta, allianceColor });
    useFieldOrientationStore.getState().setValue(orientation);
    render(
      <FieldElement edgeInsets={insets} respectAlliance={respectAlliance}>
        <Text>Target</Text>
      </FieldElement>,
    );
    const tree = screen.toJSON();
    if (!tree || Array.isArray(tree))
      throw new Error("Expected one field element");
    const style = tree.props.style;
    const blue = allianceColor === AllianceColor.Blue,
      normal = orientation === FieldOrientation.Auspicious;
    expect(style.top).toBe(
      `${(normal ? (respectAlliance ? (blue ? 0.1 : 0.3) : 0.3) : respectAlliance ? (blue ? 0.3 : 0.1) : 0.1) * 100}%`,
    );
    expect(style.left).toBe(
      `${(normal ? (respectAlliance ? (blue ? 0.4 : 0.2) : 0.4) : respectAlliance ? (blue ? 0.2 : 0.4) : 0.2) * 100}%`,
    );
    const hook = renderHook(() => useFieldRelativeDimensions(insets));
    expect(hook.result.current).toEqual([
      normal ? 0.1 : 0.3,
      normal ? (blue ? 0.2 : 0.4) : blue ? 0.4 : 0.2,
      normal ? 0.3 : 0.1,
      normal ? (blue ? 0.4 : 0.2) : blue ? 0.2 : 0.4,
    ]);
  },
);
test("absent reports have no field coordinates", () => {
  useReportStateStore.getState().reset();
  expect(
    renderHook(() => useFieldRelativeDimensions(insets)).result.current,
  ).toEqual([null, null, null, null]);
});
test("Figma insets preserve rectangle proportions", () => {
  expect(
    figmaDimensionsToFieldInsets({ x: 0, y: 0, width: 677, height: 337 }),
  ).toEqual([0, 0, 0, 0]);
});
test("field actions use explicit padding, artwork replacement and the default background", () => {
  const press = jest.fn();
  useReportStateStore.getState().scoutMatch(meta);
  const view = render(
    <GameAction color="red" onPress={press}>
      <Text>Score</Text>
    </GameAction>,
  );
  // Exercise the public touch callback, including its haptic feedback.
  const { fireEvent } = jest.requireActual("@testing-library/react-native");
  fireEvent.press(screen.getByText("Score"));
  expect(press).toHaveBeenCalledTimes(1);
  view.rerender(
    <GameAction
      color="red"
      icon="home"
      iconColor="blue"
      borderRadius={3}
      fieldRelativePadding={[1, 2, 3, 4]}
      backgroundViewReplacement={<Text>Artwork</Text>}
      onPress={press}
    />,
  );
  expect(screen.getByText("Artwork")).toBeTruthy();
});

test("changing alliance updates mounted field elements without stale memoized geometry", () => {
  useReportStateStore
    .getState()
    .scoutMatch({ ...meta, allianceColor: AllianceColor.Blue });
  useFieldOrientationStore.getState().setValue(FieldOrientation.Auspicious);
  render(
    <FieldElement edgeInsets={insets}>
      <Text>Robot</Text>
    </FieldElement>,
  );
  const before = screen.toJSON();
  if (!before || Array.isArray(before)) throw Error("Expected field");
  expect(before.props.style.left).toBe("40%");
  act(() => {
    useReportStateStore
      .getState()
      .scoutMatch({ ...meta, allianceColor: AllianceColor.Red });
  });
  const after = screen.toJSON();
  if (!after || Array.isArray(after)) throw Error("Expected field");
  expect(after.props.style.left).toBe("20%");
});
test("coordinate hooks keep their hook order when a report starts or is cleared", () => {
  useReportStateStore.getState().reset();
  const hook = renderHook(() => useFieldRelativeDimensions(insets));
  expect(hook.result.current).toEqual([null, null, null, null]);
  act(() => {
    useReportStateStore.getState().scoutMatch(meta);
  });
  expect(hook.result.current[0]).toBe(0.1);
  act(() => {
    useReportStateStore.getState().reset();
  });
  expect(hook.result.current).toEqual([null, null, null, null]);
});

import type {
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
const touch = (identifier: string, pageX = 0, pageY = 0) =>
  ({
    nativeEvent: { identifier, pageX, pageY },
  }) as unknown as GestureResponderEvent;
const gesture = {} as PanResponderGestureState;
it.each(combos)(
  "drag control geometry follows $allianceColor/$orientation/$respectAlliance",
  ({ orientation, allianceColor, respectAlliance }) => {
    useReportStateStore.getState().scoutMatch({ ...meta, allianceColor });
    useFieldOrientationStore.getState().setValue(orientation);
    const spy = jest
      .spyOn(PanResponder, "create")
      .mockReturnValue({ panHandlers: {} });
    render(
      <DraggableContainer
        edgeInsets={insets}
        respectAlliance={respectAlliance}
        onStart={() => {}}
        onMove={() => {}}
        onEnd={() => {}}
      />,
    );
    const tree = screen.toJSON();
    if (!tree || Array.isArray(tree)) throw Error("Expected drag target");
    expect(tree.props.style.position).toBe("absolute");
    spy.mockRestore();
  },
);
test("drag lifecycle rejects foreign touches, reports distances, and terminates cleanly", () => {
  const spy = jest
      .spyOn(PanResponder, "create")
      .mockReturnValue({ panHandlers: {} }),
    start = jest.fn(),
    move = jest.fn(),
    end = jest.fn();
  useReportStateStore.getState().scoutMatch(meta);
  render(
    <DraggableContainer
      edgeInsets={insets}
      respectAlliance
      onStart={start}
      onMove={move}
      onEnd={end}
    />,
  );
  const callbacks = spy.mock.calls[0][0];
  expect(callbacks.onStartShouldSetPanResponder?.(touch("one"), gesture)).toBe(
    true,
  );
  expect(callbacks.onMoveShouldSetPanResponder?.(touch("one"), gesture)).toBe(
    false,
  );
  callbacks.onPanResponderMove?.(touch("other"), gesture);
  callbacks.onPanResponderRelease?.(touch("other"), gesture);
  callbacks.onPanResponderTerminate?.(touch("other"), gesture);
  callbacks.onPanResponderGrant?.(touch("one", 1, 2), gesture);
  callbacks.onPanResponderGrant?.(touch("other"), gesture);
  callbacks.onPanResponderGrant?.(touch("one"), gesture);
  expect(start).toHaveBeenCalledTimes(1);
  expect(callbacks.onStartShouldSetPanResponder?.(touch("one"), gesture)).toBe(
    true,
  );
  expect(
    callbacks.onStartShouldSetPanResponder?.(touch("other"), gesture),
  ).toBe(false);
  expect(
    callbacks.onPanResponderTerminationRequest?.(touch("one"), gesture),
  ).toBe(true);
  expect(
    callbacks.onPanResponderTerminationRequest?.(touch("other"), gesture),
  ).toBe(false);
  expect(callbacks.onMoveShouldSetPanResponder?.(touch("one"), gesture)).toBe(
    true,
  );
  callbacks.onPanResponderMove?.(touch("one", 4, 6), gesture);
  expect(move).toHaveBeenCalledWith(3, 4, 5);
  callbacks.onPanResponderRelease?.(touch("one", 4, 6), gesture);
  expect(end).toHaveBeenCalledWith(3, 4, 5);
  callbacks.onPanResponderGrant?.(touch("two", 0, 0), gesture);
  callbacks.onPanResponderTerminate?.(touch("two", 6, 8), gesture);
  expect(end).toHaveBeenLastCalledWith(6, 8, 10);
  spy.mockRestore();
});
it.each([true, false])(
  "auto-to-teleop closes an active drag with start timestamp %s",
  (started) => {
    const spy = jest
        .spyOn(PanResponder, "create")
        .mockReturnValue({ panHandlers: {} }),
      end = jest.fn(),
      force = jest.fn();
    useReportStateStore.getState().scoutMatch(meta);
    if (started) {
      useReportStateStore.getState().setStartPosition(50);
      useReportStateStore.getState().initializeMatchTimestamp();
    }
    render(
      <DraggableContainer
        edgeInsets={insets}
        respectAlliance
        onStart={() => {}}
        onMove={() => {}}
        onEnd={end}
        forceStop={started ? force : undefined}
      />,
    );
    spy.mock.calls[0][0].onPanResponderGrant?.(touch("one"), gesture);
    act(() => {
      useReportStateStore.getState().setGamePhase(GamePhase.Teleop);
    });
    expect(end).toHaveBeenCalledWith(0, 0, 0, expect.any(Number));
    if (started) expect(force).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  },
);

test("icon actions fall back to their action color", () => {
  useReportStateStore.getState().scoutMatch(meta);
  render(<GameAction color="red" icon="home" onPress={() => {}} />);
  expect(screen.getByText("home").props.style.color).toBe("red");
});

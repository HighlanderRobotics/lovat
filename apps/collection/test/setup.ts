import { Animated } from "react-native";
import "react-native-gesture-handler/jestSetup";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";
TimeAgo.addDefaultLocale(en);

import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest"),
);
jest.mock("react-native-reanimated", () =>
  jest.requireActual("react-native-reanimated/mock"),
);
jest.mock("@react-native-community/netinfo", () =>
  jest.requireActual("@react-native-community/netinfo/jest/netinfo-mock.js"),
);
jest.mock("react-native-get-random-values", () => ({}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissAll: jest.fn(),
  },
  Stack: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    { Screen: () => null },
  ),
  SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
  Redirect: ({ href }: { href: string }) =>
    jest
      .requireActual("react")
      .createElement(jest.requireActual("react-native").Text, null, href),
  useGlobalSearchParams: jest.fn(() => ({})),
  useRouter: () => jest.requireMock("expo-router").router,
  useLocalSearchParams: jest.fn(() => ({})),
  useNavigation: jest.fn(() => ({
    dispatch: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    setOptions: jest.fn(),
  })),
  useFocusEffect: (callback: () => void) =>
    jest.requireActual("react").useEffect(callback, [callback]),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("react-native-gesture-handler", () => {
  const native = jest.requireActual("react-native");
  return {
    TouchableOpacity: native.TouchableOpacity,
    Switch: native.Switch,
    GestureHandlerRootView: native.View,
    ScrollView: native.ScrollView,
  };
});

// Unit and component tests must never contact a real service.
globalThis.fetch = jest
  .fn()
  .mockRejectedValue(new Error("Unexpected outbound HTTP in test"));

// The native animation driver is deterministic in component tests; app effects
// and their target values still execute, without wall-clock frame callbacks.
beforeEach(() => {
  jest.spyOn(Animated, "timing").mockImplementation((value, config) => ({
    start: (callback) => {
      if (value instanceof Animated.Value)
        value.setValue(config.toValue as number);
      else value.setValue(config.toValue as { x: number; y: number });
      callback?.({ finished: true });
    },
    stop: () => {},
    reset: () => {},
  }));
});

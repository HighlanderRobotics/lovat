import { MagnoliaProvider } from "@highlanderrobotics/magnolia-react-native";
import { TrainingConnection } from "../lib/training/TrainingConnection";
import { SplashScreen, Stack } from "expo-router";
import { NativeModules } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colors } from "../lib/colors";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { getServiceLoader, useTournamentsStore } from "../lib/services";

import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFieldOrientationStore,
  useOnboardingCompleteStore,
  useQrCodeSizeStore,
  useScouterStore,
  useStartMatchEnabledStore,
  useTeamStore,
  useTournamentStore,
  useTrainingModeStore,
  startupStores,
} from "../lib/storage/userStores";
import { waitForStoreHydration } from "../lib/storage/zustandStorage";
import { migrateLegacyStartup } from "../lib/collection/legacyStartup";

const { UIManager } = NativeModules;

if (UIManager?.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

TimeAgo.addDefaultLocale(en);

SplashScreen.preventAutoHideAsync();

// This record does not actually have a type of any, it is using any because when it uses any other type, typescript complains because it treats the functions to have an argument of never
/* eslint-disable-next-line */
const storageMigratorsByLegacyKey: Record<string, (value: any) => void> = {
  "onboarding-complete": useOnboardingCompleteStore.getState().setValue,
  "team-number": useTeamStore.getState().setNumber,
  "team-code": useTeamStore.getState().setCode,
  scouter: useScouterStore.getState().setValue,
  tournament: (value: string) => {
    // Never request tournaments here: the service loader validates the scouter.
    const tournament = useTournamentsStore
      .getState()
      .data?.find((item) => item.key === value);
    if (!useScouterStore.getState().value || !tournament) return false;
    useTournamentStore.getState().setValue(tournament);
    return true;
  },
  trainingMode: useTrainingModeStore.getState().setValue,
  qrCodeSize: useQrCodeSizeStore.getState().setValue,
  fieldOrientation: useFieldOrientationStore.getState().setValue,
} as const;

export default function Layout() {
  const [startupReady, setStartupReady] = useState(false);
  const loadServices = getServiceLoader();

  const setStartMatchEnabled = useStartMatchEnabledStore(
    (state) => state.setValue,
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setStartMatchEnabled(true);
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  });

  const [fontsLoaded, fontError] = useFonts({
    Heebo_400Regular: require("../assets/fonts/Heebo-Regular.ttf"),
    Heebo_500Medium: require("../assets/fonts/Heebo-Medium.ttf"),
    Heebo_600SemiBold: require("../assets/fonts/Heebo-SemiBold.ttf"),
    Heebo_700Bold: require("../assets/fonts/Heebo-Bold.ttf"),
    MaterialSymbols_500Rounded: require("../assets/fonts/Material-Symbols-Rounded.ttf"),
    MaterialSymbols_500Rounded40px: require("../assets/fonts/Material-Symbols-Rounded-40px.ttf"),
    MaterialSymbols_500Rounded48px: require("../assets/fonts/Material-Symbols-Rounded-48px.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    (async () => {
      await Promise.all(startupStores.map(waitForStoreHydration));
      const errors = await migrateLegacyStartup(
        AsyncStorage,
        storageMigratorsByLegacyKey,
      );
      errors.forEach((error) =>
        console.error("Legacy startup migration failed", error),
      );
      if (!active) return;
      setStartupReady(true);
      await loadServices();
      if (!active) return;
      interval = setInterval(loadServices, 2 * 60 * 1000);
    })().catch((error) => {
      console.error("Collection startup failed", error);
      if (active) setStartupReady(true);
    });
    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!startupReady || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <MagnoliaProvider mode="dark">
      <KeyboardProvider>
        <TrainingConnection />
        <GestureHandlerRootView
          style={{ backgroundColor: colors.background.default, flex: 1 }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.background.default,
              },
            }}
          />
        </GestureHandlerRootView>
      </KeyboardProvider>
    </MagnoliaProvider>
  );
}

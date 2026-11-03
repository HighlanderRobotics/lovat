import { Redirect, Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { resolveStartupRoute } from "../lib/collection/startup";
import {
  useOnboardingCompleteStore,
  useScouterStore,
  useTeamStore,
  useTournamentStore,
} from "../lib/storage/userStores";
import { waitForStoreHydration } from "../lib/storage/zustandStorage";

const startupStores = [
  useOnboardingCompleteStore,
  useScouterStore,
  useTeamStore,
  useTournamentStore,
];

export default function Index() {
  const onboardingComplete = useOnboardingCompleteStore((state) => state.value);
  const teamCode = useTeamStore((state) => state.code);
  const scouter = useScouterStore((state) => state.value);
  const tournament = useTournamentStore((state) => state.value);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all(startupStores.map(waitForStoreHydration)).then(() => {
      if (!cancelled) {
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          animation: "none",
        }}
      />
      {hydrated ? (
        <Redirect
          href={resolveStartupRoute({
            onboardingComplete,
            teamCode,
            scouter,
            tournament,
          })}
        />
      ) : (
        <Text>Loading...</Text>
      )}
    </>
  );
}

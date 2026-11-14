import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type NativeActivityStatus = {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  registrationError?: string;
};

export type ActivityConfiguration = {
  installationId: string;
  tournamentKey: string;
  scouterUuid: string;
  teamCode: string;
  baseUrl: string;
};

type LiveActivitiesModule = {
  status(): Promise<NativeActivityStatus>;
  sync(
    config: ActivityConfiguration | Record<string, never>,
    json: string | null,
    preview: boolean,
  ): Promise<NativeActivityStatus>;
  stop(): Promise<void>;
};

// Expo Go and Android can still open Debug without crashing.
export const liveActivities =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<LiveActivitiesModule>("LovatLiveActivities")
    : null;

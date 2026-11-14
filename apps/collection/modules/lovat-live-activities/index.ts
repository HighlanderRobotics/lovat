import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { MascotStyle } from "../../lib/liveActivities/state";

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
  mascotStyle: MascotStyle;
};

type LiveActivitiesModule = {
  status(): Promise<NativeActivityStatus>;
  sync(
    config: ActivityConfiguration | Pick<ActivityConfiguration, "mascotStyle">,
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

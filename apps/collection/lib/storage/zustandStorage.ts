import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/* eslint-disable-next-line */
export const storage = createJSONStorage<any>(() => AsyncStorage);

export type GenericStore<T> = {
  value: T;
  setValue: (value: T) => void;
};

type HydratableStore = {
  persist: {
    hasHydrated: () => boolean;
    rehydrate: () => Promise<void> | void;
  };
};

export async function waitForStoreHydration(
  store: HydratableStore,
): Promise<void> {
  if (store.persist.hasHydrated()) {
    return;
  }

  // onFinishHydration only fires on success. Await the attempt itself so a
  // storage/JSON error can fall back to the store's defaults without hanging
  // the whole app. Never clear storage here: offline reports must be preserved.
  await store.persist.rehydrate();
}

export function createGenericPersistantStore<T>(name: string, defaultValue: T) {
  return create(
    persist<GenericStore<T>>(
      (set) => ({
        value: defaultValue,
        setValue: (value) => set({ value: value }),
      }),
      {
        name: name,
        storage: storage,
      },
    ),
  );
}

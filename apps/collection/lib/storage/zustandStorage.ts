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
    onFinishHydration: (listener: () => void) => () => void;
  };
};

export function waitForStoreHydration(store: HydratableStore): Promise<void> {
  if (store.persist.hasHydrated()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
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

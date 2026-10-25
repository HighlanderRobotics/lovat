type StringStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

// Read the shared legacy key without changing it: offseason builds still own
// Charged Up reports there. New 2026 writes use their own namespace.
export function seasonHistoryStorage(
  storage: StringStorage,
  validEntry: (entry: unknown) => boolean,
) {
  return {
    ...storage,
    getItem: async (key: string): Promise<string | null> => {
      const current = await storage.getItem(key);
      if (current !== null) return current;

      const legacy = await storage.getItem("historyStore");
      if (legacy === null) return null;

      try {
        const parsed = JSON.parse(legacy);
        if (!Array.isArray(parsed?.state?.history)) return null;
        return JSON.stringify({
          ...parsed,
          state: {
            ...parsed.state,
            history: parsed.state.history.filter(validEntry),
          },
        });
      } catch {
        return null;
      }
    },
  };
}

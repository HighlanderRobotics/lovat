type LegacyStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
};

// Run sequentially after hydration. Failed migrations keep their original key.
export async function migrateLegacyStartup(
  storage: LegacyStorage,
  migrators: Record<
    string,
    (value: unknown) => boolean | void | Promise<boolean | void>
  >,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const [key, migrate] of Object.entries(migrators)) {
    try {
      const raw = await storage.getItem(key);
      if (raw === null) continue;
      const value =
        key === "team-code" || key === "tournament" ? raw : JSON.parse(raw);
      if ((await migrate(value)) !== false) await storage.removeItem(key);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

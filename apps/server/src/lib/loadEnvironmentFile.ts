import { config } from "dotenv";

export const loadEnvironmentFile = (path?: string): void => {
  const result = config({ path, quiet: true });

  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code !== "ENOENT"
  ) {
    throw result.error;
  }
};

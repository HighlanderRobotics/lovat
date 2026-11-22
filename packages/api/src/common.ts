import { z } from "zod";
export const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(8_640_000_000_000_000);

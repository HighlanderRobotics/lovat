import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  displayError: z.string(),
  invalidFields: z.array(z.string()).optional(),
  retryAfterSeconds: z.number().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

import { z } from "zod";

export const customPostMatchQuestionsSchema = z
  .array(z.string().trim().min(1).max(300))
  .max(3)
  .refine(
    (questions) => new Set(questions).size === questions.length,
    "Questions must be unique",
  );

export const customPostMatchAnswersSchema = z
  .array(
    z.object({
      question: z.string().trim().min(1).max(300),
      answer: z.string().max(2000),
    }),
  )
  .max(3)
  .refine(
    (answers) =>
      new Set(answers.map((a) => a.question)).size === answers.length,
    "Questions must be unique",
  );

export const customPostMatchSettingsSchema = z.object({
  customPostMatch: customPostMatchQuestionsSchema,
});
export const customPostMatchResponseSchema =
  customPostMatchSettingsSchema.extend({ teamNumber: z.number().int() });

export function customPostMatchCSV(value: unknown): Record<string, string> {
  const answers = customPostMatchAnswersSchema.parse(value ?? []);
  const cells: Record<string, string> = {};
  const safeCell = (text: string) =>
    /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
  for (let i = 0; i < 3; i++) {
    cells[`customQuestion${i + 1}`] = safeCell(answers[i]?.question ?? "");
    cells[`customAnswer${i + 1}`] = safeCell(answers[i]?.answer ?? "");
  }
  return cells;
}

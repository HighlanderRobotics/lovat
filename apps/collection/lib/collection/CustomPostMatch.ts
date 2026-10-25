import { z } from "zod";

export const customPostMatchQuestionsSchema = z
  .array(z.string().trim().min(1).max(300))
  .max(3)
  .refine((questions) => new Set(questions).size === questions.length);
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
  );
export type CustomPostMatchAnswer = z.infer<
  typeof customPostMatchAnswersSchema
>[number];

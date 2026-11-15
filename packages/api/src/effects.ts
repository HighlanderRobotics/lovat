import { z } from "zod";
export const effectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cache.revision"),
      teamNumber: z.number().int(),
      revision: z.string().regex(/^(0|[1-9]\d*)$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("email.send"),
      to: z.email(),
      subject: z.string().max(500),
      text: z.string().max(50000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("slack.warning"),
      reportUuid: z.string().min(1),
      sourceTeamNumber: z.number().int(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("slack.warning.channel"),
      reportUuid: z.string().min(1),
      sourceTeamNumber: z.number().int(),
      subscriptionId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("slack.message"),
      channelId: z.string(),
      workspaceId: z.string(),
      text: z.string().max(50000),
    })
    .strict(),
]);
export type Effect = z.infer<typeof effectSchema>;

import { z } from "zod";

export type MascotStyle = "original" | "plain" | "outlined" | "holding";

export const mascotStyles: {
  value: MascotStyle;
  label: string;
  description: string;
}[] = [
  {
    value: "original",
    label: "Style 1 · Original",
    description: "Purple background and white head circle.",
  },
  {
    value: "plain",
    label: "Style 2 · Plain",
    description: "No purple background or collapsed head circle.",
  },
  {
    value: "outlined",
    label: "Style 3 · Outline",
    description:
      "No purple background, with a white circle and the original collapsed size.",
  },
  {
    value: "holding",
    label: "Style 4 · Holding binoculars",
    description:
      "Your new character holding binoculars in the expanded on-shift view.",
  },
];

export const activityStateSchema = z.object({
  phase: z.enum(["waiting", "onShift"]),
  nowMatch: z.string(),
  assignments: z
    .array(
      z.object({
        matchKey: z.string(),
        matchLabel: z.string(),
        teamNumber: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(4),
  tournamentName: z.string(),
  nextStartTime: z.number().nullable(),
  updatedAt: z.number(),
});

export type ActivityState = z.infer<typeof activityStateSchema>;

export function activityPreview(phase: "waiting" | "onShift"): ActivityState {
  return {
    phase,
    nowMatch: phase === "waiting" ? "Q18" : "Q28",
    assignments: [
      { matchKey: "preview-q28", matchLabel: "Q28", teamNumber: 8433 },
      { matchKey: "preview-q39", matchLabel: "Q39", teamNumber: 8033 },
      { matchKey: "preview-p1", matchLabel: "P1", teamNumber: 8433 },
      { matchKey: "preview-f1", matchLabel: "F1", teamNumber: 8033 },
    ],
    tournamentName: "Live Activity preview",
    nextStartTime: Math.floor(Date.now() / 1000) + 600,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

import { tokens } from "@highlanderrobotics/magnolia-tokens";
const theme = tokens.themes.dark;

export type ColorSet = {
  default: string;
  hover: string;
  faded: string;
};

export const colors = {
  victoryPurple: {
    default: theme.primary,
    hover: theme.primaryHover,
    faded: theme.primaryDisabled,
  },
  gray: {
    default: theme.secondary,
    hover: theme.secondaryHover,
    faded: theme.secondaryDisabled,
  },
  danger: {
    default: theme.danger,
    hover: theme.dangerHover,
    faded: theme.dangerDisabled,
  },
  secondaryContainer: {
    default: theme.surface,
  },
  background: {
    default: theme.background,
  },
  onBackground: {
    default: theme.onBackground,
  },
  body: {
    default: theme.muted,
  },
} as const satisfies Record<string, Partial<ColorSet>>;

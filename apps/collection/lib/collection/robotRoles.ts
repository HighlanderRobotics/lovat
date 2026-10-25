import type { PostMatchData } from "./ChargedUp";

export const robotRoleOptions = [
  {
    value: "OFFENCE",
    label: "Offence",
    description: "Collected and scored cones or cubes in the alliance grid.",
  },
  {
    value: "DEFENCE",
    label: "Defence",
    description: "Blocked opponents or disrupted their routes and scoring.",
  },
  {
    value: "FEEDING",
    label: "Feeding",
    description: "Moved pieces for alliance partners without scoring them.",
  },
  {
    value: "IMMOBILE",
    label: "Immobile",
    description:
      "Appeared on the field but could not move for a significant part of the match.",
  },
  {
    value: "NO_SHOW",
    label: "No show",
    description: "Did not appear on the field for this match.",
  },
] satisfies {
  value: PostMatchData["robotRoles"][number];
  label: string;
  description: string;
}[];

export function toggleRobotRole(
  roles: PostMatchData["robotRoles"],
  value: PostMatchData["robotRoles"][number],
): PostMatchData["robotRoles"] {
  if (roles.includes(value)) return roles.filter((role) => role !== value);
  if (value === "NO_SHOW") return [value];
  return [...roles.filter((role) => role !== "NO_SHOW"), value];
}

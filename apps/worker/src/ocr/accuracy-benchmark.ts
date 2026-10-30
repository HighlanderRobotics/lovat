import { z } from "zod";
import type { fuseOfficialMatch } from "./fusion-official";

const phase = z.enum(["AUTO", "TELEOP", "TOTAL"]);
const alliance = z.enum(["RED", "BLUE"]);
const count = z.number().int().min(0).max(99999);
export const referenceSchema = z.object({
  matchKey: z.string().min(1),
  evidence: z.string().min(1),
  notes: z.array(z.string()),
  robotCounts: z
    .array(
      z
        .object({
          teamNumber: z.number().int().positive(),
          alliance,
          phase,
          minimum: count,
          maximum: count,
          basis: z.enum(["ROBOT_ONLY", "UPPER_BOUND_INCLUDES_HP"]),
        })
        .refine((r) => r.minimum <= r.maximum, "Reversed count bounds")
        .refine(
          (r) => r.basis !== "UPPER_BOUND_INCLUDES_HP" || r.minimum === 0,
          "Unseparated human-player counts provide an upper bound only",
        ),
    )
    .min(1),
  humanPlayerMinimums: z.array(z.object({ alliance, phase, fuel: count })),
});
type OfficialResult = ReturnType<typeof fuseOfficialMatch>;
type Phase = z.infer<typeof phase>;
const order = (p: Phase) => ["AUTO", "TELEOP", "TOTAL"].indexOf(p);

/** Distance to a permitted count range is a lower bound on absolute error,
 * never an exact error unless independent robot-only counts are exact. */
export function evaluateAccuracy(result: OfficialResult, raw: unknown) {
  const reference = referenceSchema.parse(raw);
  if (reference.matchKey !== result.matchKey)
    throw new Error("Reference match identity mismatch");
  const seen = new Set<string>();
  const rows = reference.robotCounts
    .map((label) => {
      const key = `${label.teamNumber}:${label.phase}`;
      if (seen.has(key)) throw new Error("Duplicate robot/phase reference");
      seen.add(key);
      const a = result.alliances.find((a) => a.alliance === label.alliance);
      const robot = a?.teams.find((t) => t.teamNumber === label.teamNumber);
      if (!robot || !a)
        throw new Error("Reference robot/alliance not in roster");
      const budget =
        label.phase === "TOTAL"
          ? a.officialFuel
          : a.phases.find((p) => p.phase === label.phase)!.fuelCount;
      if (label.maximum > budget)
        throw new Error("Reference count exceeds official phase fuel");
      const estimated =
        label.phase === "AUTO"
          ? robot.autoFuelCount
          : label.phase === "TELEOP"
            ? robot.teleopFuelCount
            : robot.estimatedFuel;
      const exact =
        label.basis === "ROBOT_ONLY" && label.minimum === label.maximum;
      return {
        ...label,
        estimated,
        exact,
        minimumAbsoluteError: Math.max(
          label.minimum - estimated,
          estimated - label.maximum,
          0,
        ),
        maximumAbsoluteError: Math.max(
          Math.abs(estimated - label.minimum),
          Math.abs(estimated - label.maximum),
        ),
        signedError: exact ? estimated - label.minimum : null,
        verdict:
          estimated < label.minimum
            ? "BELOW_BOUND"
            : estimated > label.maximum
              ? "ABOVE_BOUND"
              : exact
                ? "EXACT_MATCH"
                : "WITHIN_BOUND_NOT_VALIDATED",
      };
    })
    .sort(
      (a, b) => order(a.phase) - order(b.phase) || a.teamNumber - b.teamNumber,
    );
  const summary = (["AUTO", "TELEOP", "TOTAL"] as const).map((phase) => {
    const subset = rows.filter((r) => r.phase === phase);
    const exact = subset.filter((r) => r.exact);
    return {
      phase,
      labels: subset.length,
      exactLabels: exact.length,
      boundedLabels: subset.length - exact.length,
      violations: subset.filter((r) => r.minimumAbsoluteError > 0).length,
      minimumAbsoluteError: subset.reduce(
        (n, r) => n + r.minimumAbsoluteError,
        0,
      ),
      exactSubsetMeanAbsoluteError: exact.length
        ? exact.reduce((n, r) => n + r.minimumAbsoluteError, 0) / exact.length
        : null,
      exactSubsetSignedBias: exact.length
        ? exact.reduce((n, r) => n + r.signedError!, 0) / exact.length
        : null,
      exactSubsetAllZero:
        exact.length > 0 && exact.every((r) => r.maximum === 0),
    };
  });
  for (const a of result.alliances) {
    for (const p of ["AUTO", "TELEOP", "TOTAL"] as const) {
      const minimum = rows
        .filter((r) => r.alliance === a.alliance && r.phase === p)
        .reduce((n, r) => n + r.minimum, 0);
      const budget =
        p === "TOTAL"
          ? a.officialFuel
          : a.phases.find((phase) => phase.phase === p)!.fuelCount;
      if (minimum > budget)
        throw new Error("Reference robot minima exceed alliance phase budget");
    }
    for (const robot of a.teams) {
      const labels = rows.filter((r) => r.teamNumber === robot.teamNumber);
      const bounds = (p: Phase) => {
        const label = labels.find((r) => r.phase === p);
        return label
          ? ([label.minimum, label.maximum] as const)
          : ([
              0,
              p === "TOTAL"
                ? a.officialFuel
                : a.phases.find((phase) => phase.phase === p)!.fuelCount,
            ] as const);
      };
      const auto = bounds("AUTO"),
        tele = bounds("TELEOP"),
        total = bounds("TOTAL");
      if (auto[0] + tele[0] > total[1] || auto[1] + tele[1] < total[0])
        throw new Error(
          "Robot phase and total reference bounds contradict each other",
        );
    }
  }
  const constraints = new Set<string>();
  const humanPlayerChecks = reference.humanPlayerMinimums
    .map((hp) => {
      const key = `${hp.alliance}:${hp.phase}`;
      if (constraints.has(key))
        throw new Error("Duplicate human-player constraint");
      constraints.add(key);
      const a = result.alliances.find((a) => a.alliance === hp.alliance)!;
      const p = a.phases.find((p) => p.phase === hp.phase);
      const officialFuel = hp.phase === "TOTAL" ? a.officialFuel : p!.fuelCount;
      const unknown =
        hp.phase === "TOTAL" ? a.unattributedFuel : p!.unattributedFuel;
      if (hp.fuel > officialFuel)
        throw new Error("Human-player minimum exceeds budget");
      const robotMinimum = rows
        .filter((r) => r.alliance === hp.alliance && r.phase === hp.phase)
        .reduce((n, r) => n + r.minimum, 0);
      if (robotMinimum + hp.fuel > officialFuel)
        throw new Error(
          "Robot and human-player reference minima exceed budget",
        );
      const maximumRobotFuel = officialFuel - hp.fuel;
      const estimatedRobotFuel = officialFuel - unknown;
      return {
        ...hp,
        officialFuel,
        estimatedRobotFuel,
        maximumRobotFuel,
        minimumRobotOvercredit: Math.max(
          0,
          estimatedRobotFuel - maximumRobotFuel,
        ),
      };
    })
    .sort(
      (a, b) =>
        order(a.phase) - order(b.phase) || a.alliance.localeCompare(b.alliance),
    );
  return {
    matchKey: result.matchKey,
    algorithm: result.algorithm,
    semanticInputSha256: result.semanticInputSha256,
    evidence: reference.evidence,
    notes: reference.notes,
    rows,
    summary,
    humanPlayerChecks,
    limitations: [
      "Exact-subset metrics cover only independently counted robot-only labels; zero-only labels do not measure positive scorer accuracy.",
      "Distance to a bound is a minimum error. Being within bounds does not validate the estimate.",
      "AUTO/TELEOP and TOTAL summaries overlap and must not be added together.",
      "Human-player overcredit bounds can overlap robot bound violations; do not sum them as independent errors.",
    ],
  };
}

import { z } from "zod";

const value = z.number().int().min(0).max(99999);
const gridSchema = z.object({
  runtime: z.object({ tesseractVersion: z.string(), language: z.literal("eng"), modelSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  measurements: z.array(z.object({
    caseId: z.string(), fieldId: z.string(), sourceRgbSha256: z.string().regex(/^[a-f0-9]{64}$/),
    field: z.enum(["clock", "points", "fuel", "text"]), round: z.union([z.literal(1), z.literal(2)]),
    scale: z.union([z.literal(2), z.literal(3), z.literal(4)]), psm: z.union([z.literal(7), z.literal(8), z.literal(13)]),
    padding: z.union([z.literal(0), z.literal(10), z.literal(20)]), stage: z.enum(["primary", "normalizedGray", "binary"]),
    parsedValue: value.nullable(), confidentSyntax: z.boolean(), elapsedMicros: z.number().nonnegative(),
  }).refine(r => r.stage === "primary" || r.padding === 10, "Invalid recovery border")).min(1).max(40000),
});
const referencesSchema = z.object({ labels: z.array(z.object({
  id: z.string().regex(/^2026[a-z0-9]+_qm\d+-v\d+$/), split: z.enum(["train", "calibration", "test"]),
  sourceRgbSha256: z.string().regex(/^[a-f0-9]{64}$/), values: z.record(z.string(), value),
})).min(1) });
type Measurement = z.infer<typeof gridSchema>["measurements"][number];
type Profile = { scale: 2 | 3 | 4; psm: 7 | 8 | 13; padding: 0 | 10 | 20 };
type Example = { caseId: string; fieldId: string; field: string; split: string; expected: number; rows: Measurement[] };
const key = (r: Profile & { stage: string; round: number }) => [r.round, r.scale, r.psm, r.padding, r.stage].join(":");
const median = (xs: number[]) => { const a = [...xs].sort((a, b) => a - b); return (a[Math.floor((a.length - 1) / 2)]! + a[Math.floor(a.length / 2)]!) / 2; };
function evaluate(examples: Example[], profile: Profile) {
  let correct = 0, falseAccepts = 0, missing = 0, unstable = 0, micros = 0;
  for (const example of examples) {
    const results = [1, 2].map(round => {
      const find = (scale: number, psm: number, padding: number, stage: string) => {
        const row = example.rows.find(r => r.round === round && r.scale === scale && r.psm === psm && r.padding === padding && r.stage === stage);
        if (!row) throw new Error("Incomplete field grid");
        return row;
      };
      // Reproduce the production retry gate. The primary is experimental;
      // normalization/binary recovery retain the production 4x/PSM7 settings.
      const primary = find(profile.scale, profile.psm, profile.padding, "primary");
      let cost = primary.elapsedMicros;
      if (primary.confidentSyntax) return { value: primary.parsedValue, cost };
      for (const stage of ["normalizedGray", "binary"]) {
        const row = find(4, 7, 10, stage); cost += row.elapsedMicros;
        if (row.confidentSyntax) return { value: row.parsedValue, cost };
      }
      return { value: null, cost };
    });
    micros += median(results.map(r => r.cost));
    if (results[0]!.value !== results[1]!.value) unstable++;
    if (results.some(r => r.value !== null && r.value !== example.expected)) falseAccepts++;
    else if (results.every(r => r.value === example.expected)) correct++;
    else missing++;
  }
  return { fields: examples.length, correct, falseAccepts, missing, unstable,
    meanPipelineMicros: examples.length ? micros / examples.length : null };
}

/** Select only on train/calibration pixels. Test references affect evaluation
 * after selection and cannot enter ranking. These crop metrics do not include
 * video clock plausibility, multi-crop agreement or exact-crop cache savings. */
export function selectFieldProfiles(rawGrid: unknown, rawReferences: unknown) {
  const grid = gridSchema.parse(rawGrid), references = referencesSchema.parse(rawReferences);
  const labels = new Map(references.labels.map(l => [l.id, l]));
  if (labels.size !== references.labels.length) throw new Error("Duplicate reference case");
  const matchSplits = new Map<string, string>(), pixelSplits = new Map<string, string>();
  for (const label of references.labels) {
    for (const [map, identity] of [[matchSplits, label.id.split("-v")[0]!], [pixelSplits, label.sourceRgbSha256]] as const) {
      if (map.has(identity) && map.get(identity) !== label.split) throw new Error("Match/pixels leak across dataset splits");
      map.set(identity, label.split);
    }
  }
  const grouped = new Map<string, Example>();
  for (const row of grid.measurements) {
    const label = labels.get(row.caseId);
    if (!label || label.sourceRgbSha256 !== row.sourceRgbSha256) throw new Error("Pixel/reference identity mismatch");
    if (label.values[row.fieldId] === undefined) throw new Error("Missing independent reference value");
    const id = row.caseId + ":" + row.fieldId;
    const example = grouped.get(id) ?? { caseId: row.caseId, fieldId: row.fieldId, field: row.field,
      split: label.split, expected: label.values[row.fieldId]!, rows: [] };
    if (example.field !== row.field || example.rows.some(r => key(r) === key(row)))
      throw new Error("Conflicting or duplicate field measurement");
    if (row.confidentSyntax && row.parsedValue === null) throw new Error("Accepted syntax without a value");
    example.rows.push(row); grouped.set(id, example);
  }
  for (const example of grouped.values()) if (example.rows.length !== 90)
    throw new Error("Incomplete field grid");
  for (const label of labels.values()) if (![...grouped.values()].some(e => e.caseId === label.id))
    throw new Error("Reference case missing from field grid");
  const results = ["fuel", "points", "clock"].map(field => {
    const examples = [...grouped.values()].filter(e => e.field === field && e.fieldId !== "clockUnion");
    const fitting = examples.filter(e => e.split !== "test"), test = examples.filter(e => e.split === "test");
    if (!fitting.length || !test.length) throw new Error("Each field needs fitting and held-out examples");
    const baseline: Profile = { scale: 4, psm: 7, padding: field === "clock" ? 20 : 0 };
    const candidates = [];
    for (const scale of [2, 3, 4] as const) for (const psm of [7, 8, 13] as const)
      for (const padding of [0, 10, 20] as const) {
        const profile = { scale, psm, padding }; candidates.push({ profile, fitting: evaluate(fitting, profile) });
      }
    candidates.sort((a, b) => a.fitting.falseAccepts - b.fitting.falseAccepts ||
      a.fitting.unstable - b.fitting.unstable || b.fitting.correct - a.fitting.correct ||
      a.fitting.meanPipelineMicros! - b.fitting.meanPipelineMicros! ||
      a.profile.scale - b.profile.scale || a.profile.psm - b.profile.psm || a.profile.padding - b.profile.padding);
    const selected = candidates[0]!;
    return { field, baseline: { profile: baseline, fitting: evaluate(fitting, baseline), test: evaluate(test, baseline) },
      selected: { ...selected, test: evaluate(test, selected.profile) }, candidates };
  });
  return { runtime: grid.runtime, results, promoted: false,
    caveat: "Parameters selected only on train/calibration crops. Repeated rounds count once per field. Pixel labels were read visually by the agent, not independently double-reviewed. Full-video validation and additional matches remain necessary; these metrics are not robot attribution accuracy." };
}

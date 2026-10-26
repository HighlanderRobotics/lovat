type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Apply only to analysis reads. Raw report/export-for-review APIs retain the
// original events, including strikes, so a lead can inspect and undo decisions.
export function analysisReadArgs<T>(model: string, input: T): T {
  const output = structuredClone(input) as RecordValue;
  const constrain = (value: RecordValue, excluded: RecordValue) => {
    const where = record(value.where) ? value.where : {};
    value.where = { ...where, ...excluded };
  };
  const filterRelations = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(filterRelations);
      return;
    }
    if (!record(value)) return;
    for (const [name, child] of Object.entries(value)) {
      if ((name === "scoutReports" || name === "events") && record(child)) {
        for (const qualifier of ["some", "none"]) {
          if (record(child[qualifier]))
            child[qualifier] = { ...child[qualifier], analysisExcluded: false };
        }
        if (record(child.every))
          child.every = { OR: [{ analysisExcluded: true }, child.every] };
      }
      filterRelations(child);
    }
  };
  const traverse = (value: RecordValue) => {
    filterRelations(value.where);
    for (const selection of [value.select, value.include]) {
      if (!record(selection)) continue;
      for (const [name, child] of Object.entries(selection)) {
        if (name === "events" || name === "scoutReports") {
          if (child === true) selection[name] = {};
          const relation = selection[name];
          if (record(relation)) {
            constrain(relation, { analysisExcluded: false });
            traverse(relation);
          }
        } else if (record(child)) traverse(child);
      }
    }
  };
  if (model === "event") {
    const where = record(output.where) ? output.where : {};
    const parent = record(where.scoutReport) ? where.scoutReport : {};
    constrain(output, {
      analysisExcluded: false,
      scoutReport: { ...parent, analysisExcluded: false },
    });
  } else if (model === "scoutReport") {
    constrain(output, { analysisExcluded: false });
  }
  traverse(output);
  return output as T;
}

import { z } from "zod";
import {
  metricMetadataSchema,
  type MetricMetadata,
  type MetricValue,
} from "@lovat/api";
import type { Facts } from "./facts.js";

export interface MetricDefinition {
  metadata: MetricMetadata;
  evaluate(
    facts: readonly Facts[],
    dependencies: ReadonlyMap<string, MetricValue | null>,
  ): MetricValue | null;
  combine(
    values: readonly MetricValue[],
    level: "tournament" | "team",
  ): MetricValue | null;
}
export function defineMetric<S, V extends MetricValue>(definition: {
  metadata: MetricMetadata;
  output: z.ZodType<V>;
  calculate: (facts: Facts) => S | null;
  reports: (states: readonly S[]) => V | null;
  aggregate: (values: readonly V[], level: "tournament" | "team") => V | null;
}): MetricDefinition {
  const metadata = metricMetadataSchema.parse({
    ...definition.metadata,
    outputSchema: z.toJSONSchema(definition.output),
  });
  return {
    metadata,
    evaluate(facts) {
      const states = facts
        .map(definition.calculate)
        .filter((x): x is S => x !== null);
      const value = states.length ? definition.reports(states) : null;
      return value === null ? null : definition.output.parse(value);
    },
    combine(values, level) {
      const typed = values.map((value) => definition.output.parse(value));
      const value = typed.length ? definition.aggregate(typed, level) : null;
      return value === null ? null : definition.output.parse(value);
    },
  };
}
export function defineDerivedMetric<V extends MetricValue>(definition: {
  metadata: MetricMetadata;
  output: z.ZodType<V>;
  calculate: (
    dependencies: ReadonlyMap<string, MetricValue | null>,
  ) => V | null;
  aggregate: (values: readonly V[], level: "tournament" | "team") => V | null;
}): MetricDefinition {
  return {
    metadata: metricMetadataSchema.parse({
      ...definition.metadata,
      outputSchema: z.toJSONSchema(definition.output),
    }),
    evaluate(_facts, dependencies) {
      const value = definition.calculate(dependencies);
      return value === null ? null : definition.output.parse(value);
    },
    combine(values, level) {
      const value = definition.aggregate(
        values.map((v) => definition.output.parse(v)),
        level,
      );
      return value === null ? null : definition.output.parse(value);
    },
  };
}
export class MetricRegistry {
  private readonly definitions = new Map<string, MetricDefinition>();
  private readonly aliases = new Map<string, string>();
  constructor(definitions: readonly MetricDefinition[]) {
    for (const definition of definitions) {
      const { id, aliases } = definition.metadata;
      for (const key of [id, ...aliases]) {
        if (this.aliases.has(key)) {
          throw new Error("Duplicate metric ID or alias: " + key);
        }
        this.aliases.set(key, id);
      }
      this.definitions.set(id, definition);
    }
    this.resolve([...this.definitions.keys()]);
  }
  get(id: string): MetricDefinition {
    const canonical = this.aliases.get(id);
    const definition = canonical ? this.definitions.get(canonical) : undefined;
    if (!definition) {
      throw new RangeError("Unknown metric: " + id);
    }
    return definition;
  }
  resolve(ids: readonly string[]): MetricDefinition[] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: MetricDefinition[] = [];
    const visit = (id: string) => {
      const metric = this.get(id);
      const canonical = metric.metadata.id;
      if (visiting.has(canonical)) {
        throw new Error("Metric dependency cycle: " + canonical);
      }
      if (visited.has(canonical)) {
        return;
      }
      visiting.add(canonical);
      for (const dependency of metric.metadata.dependencies) {
        visit(dependency);
      }
      visiting.delete(canonical);
      visited.add(canonical);
      ordered.push(metric);
    };
    ids.forEach(visit);
    return ordered;
  }
  metadata(): MetricMetadata[] {
    return [...this.definitions.values()].map((d) =>
      structuredClone(d.metadata),
    );
  }
}
export const mean = (values: readonly number[]): number | null =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
export function recencyWeightedMean(values: readonly number[]): number | null {
  return values.length
    ? values
        .slice(1)
        .reduce((value, next) => value * 0.2 + next * 0.8, values[0])
    : null;
}

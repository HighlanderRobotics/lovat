import type { Facts } from "@lovat/games/2026";
import {
  MetricRegistry as GenericRegistry,
  defineMetricFor,
  defineDerivedMetricFor,
} from "@lovat/games";
export { mean, recencyWeightedMean } from "@lovat/games";
export type MetricDefinition = import("@lovat/games").MetricDefinition<Facts>;
export class MetricRegistry extends GenericRegistry<Facts> {}
export const defineMetric = defineMetricFor<Facts>();
export const defineDerivedMetric = defineDerivedMetricFor<Facts>();

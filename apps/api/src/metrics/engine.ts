import type {
  AnalysisRequest,
  AnalysisResponse,
  MetricValue,
} from "@lovat/api";
import { prepareFacts, type ReportInput, type Facts } from "./facts.js";
import type { MetricRegistry } from "./registry.js";

export function analyzeReports(
  reports: readonly ReportInput[],
  request: AnalysisRequest,
  registry: MetricRegistry,
): AnalysisResponse {
  const requested = [
    ...new Set(request.metrics.map((id) => registry.get(id).metadata.id)),
  ];
  const definitions = registry.resolve(requested);
  if (definitions.some((d) => d.metadata.season !== request.season)) {
    throw new RangeError("Unsupported metric season");
  }
  const teamSet = new Set(request.teams);
  const grouped = new Map<
    number,
    Map<string, { date: string; matches: Map<string, Facts[]> }>
  >();
  for (const report of reports) {
    if (!teamSet.has(report.teamNumber)) {
      continue;
    }
    let tournaments = grouped.get(report.teamNumber);
    if (!tournaments) {
      grouped.set(report.teamNumber, (tournaments = new Map()));
    }
    let tournament = tournaments.get(report.tournamentKey);
    if (!tournament) {
      tournaments.set(
        report.tournamentKey,
        (tournament = { date: report.tournamentDate, matches: new Map() }),
      );
    }
    let match = tournament.matches.get(report.matchKey);
    if (!match) {
      tournament.matches.set(report.matchKey, (match = []));
    }
    match.push(prepareFacts(report));
  }

  const response: AnalysisResponse = { season: request.season, teams: {} };
  for (const team of [...new Set(request.teams)]) {
    const metrics: AnalysisResponse["teams"][string]["metrics"] = {};
    const timeline: NonNullable<AnalysisResponse["teams"][string]["timeline"]> =
      [];
    const tournamentValues = new Map<string, MetricValue[]>();
    const samples = new Map<string, number>();
    const tournaments = [...(grouped.get(team)?.entries() ?? [])].sort(
      ([keyA, a], [keyB, b]) =>
        a.date.localeCompare(b.date) || keyA.localeCompare(keyB),
    );
    for (const [tournamentKey, tournament] of tournaments) {
      const matchValues = new Map<string, MetricValue[]>();
      for (const [matchKey, facts] of [...tournament.matches.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        const dependencies = new Map<string, MetricValue | null>();
        for (const definition of definitions) {
          const value = definition.evaluate(facts, dependencies);
          dependencies.set(definition.metadata.id, value);
          if (value !== null) {
            const id = definition.metadata.id;
            if (!matchValues.has(id)) {
              matchValues.set(id, []);
            }
            matchValues.get(id)!.push(value);
            samples.set(id, (samples.get(id) ?? 0) + 1);
          }
        }
        if (request.timeline) {
          timeline.push({
            matchKey,
            tournamentKey,
            metrics: Object.fromEntries(
              requested.map((id) => [
                id,
                {
                  value: dependencies.get(id) ?? null,
                  samples: dependencies.get(id) == null ? 0 : 1,
                  version: registry.get(id).metadata.version,
                },
              ]),
            ),
          });
        }
      }
      for (const definition of definitions) {
        const id = definition.metadata.id;
        const value = definition.combine(
          matchValues.get(id) ?? [],
          "tournament",
        );
        if (value !== null) {
          if (!tournamentValues.has(id)) {
            tournamentValues.set(id, []);
          }
          tournamentValues.get(id)!.push(value);
        }
      }
    }
    for (const id of requested) {
      const definition = registry.get(id);
      metrics[id] = {
        value: definition.combine(tournamentValues.get(id) ?? [], "team"),
        samples: samples.get(id) ?? 0,
        version: definition.metadata.version,
      };
    }
    response.teams[String(team)] = {
      metrics,
      ...(request.timeline ? { timeline } : {}),
    };
  }
  return response;
}

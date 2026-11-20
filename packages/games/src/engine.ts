import type {
  AnalysisRequest,
  AnalysisResponse,
  MetricValue,
} from "@lovat/api";

import type { MetricRegistry } from "./registry.js";

export interface ReportIdentity {
  uuid: string;
  teamNumber: number;
  matchKey: string;
  tournamentKey: string;
  tournamentDate: string;
}
export function analyzeGameReports<R extends ReportIdentity, F>(
  reports: readonly R[],
  request: AnalysisRequest,
  registry: MetricRegistry<F>,
  prepare: (report: R) => F,
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
    Map<string, { date: string; matches: Map<string, R[]> }>
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
    match.push(report);
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
      for (const [matchKey, matchReports] of [
        ...tournament.matches.entries(),
      ].sort(([a], [b]) => a.localeCompare(b))) {
        const collectors = definitions.map((definition) => {
          if (definition.start) return definition.start();
          const retained: F[] = [];
          return {
            add: (facts: F) => {
              retained.push(facts);
            },
            finish: (dependencies: ReadonlyMap<string, MetricValue | null>) =>
              definition.evaluate(retained, dependencies),
          };
        });
        for (const report of matchReports) {
          const facts = prepare(report);
          for (const collector of collectors) collector.add(facts);
        }
        const dependencies = new Map<string, MetricValue | null>();
        for (let i = 0; i < definitions.length; i++) {
          const definition = definitions[i];
          const value = collectors[i].finish(dependencies);

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

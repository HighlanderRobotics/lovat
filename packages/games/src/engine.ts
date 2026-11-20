import type {
  AnalysisRequest,
  AnalysisResponse,
  MetricValue,
} from "@lovat/api";
import type { MetricAccumulator, MetricRegistry } from "./registry.js";

export interface ReportIdentity {
  uuid: string;
  teamNumber: number;
  matchKey: string;
  tournamentKey: string;
  tournamentDate: string;
}
/** Matching reports stay contiguous; stable sorting preserves their input order. */
export function compareReportGroups(
  a: ReportIdentity,
  b: ReportIdentity,
): number {
  return (
    a.teamNumber - b.teamNumber ||
    a.tournamentDate.localeCompare(b.tournamentDate) ||
    a.tournamentKey.localeCompare(b.tournamentKey) ||
    a.matchKey.localeCompare(b.matchKey)
  );
}

/** Holds one match's compact report states and one tournament's reduced values. */
export function createGameAnalysis<R extends ReportIdentity, F>(
  request: AnalysisRequest,
  registry: MetricRegistry<F>,
  prepare: (report: R) => F,
) {
  const requested = [
    ...new Set(request.metrics.map((id) => registry.get(id).metadata.id)),
  ];
  const definitions = registry.resolve(requested);
  if (
    definitions.some(
      (definition) => definition.metadata.season !== request.season,
    )
  )
    throw new RangeError("Unsupported metric season");
  const indexes = new Map(
    definitions.map((definition, index) => [definition.metadata.id, index]),
  );
  const teamSet = new Set(request.teams);
  const response: AnalysisResponse = { season: request.season, teams: {} };
  let closed = false;
  let previous: ReportIdentity | undefined;
  let team:
    | {
        number: number;
        values: MetricValue[][];
        samples: number[];
        timeline: NonNullable<AnalysisResponse["teams"][string]["timeline"]>;
      }
    | undefined;
  let tournament:
    { key: string; date: string; values: MetricValue[][] } | undefined;
  let match: { key: string; collectors: MetricAccumulator<F>[] } | undefined;
  const emptyValues = () => definitions.map(() => [] as MetricValue[]);
  function finishMatch() {
    if (!match || !tournament || !team) return;
    const dependencies = new Map<string, MetricValue | null>();
    for (const [index, definition] of definitions.entries()) {
      const value = match.collectors[index].finish(dependencies);
      dependencies.set(definition.metadata.id, value);
      if (value !== null) {
        tournament.values[index].push(value);
        team.samples[index]++;
      }
    }
    if (request.timeline)
      team.timeline.push({
        matchKey: match.key,
        tournamentKey: tournament.key,
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
    match = undefined;
  }
  function finishTournament() {
    finishMatch();
    if (!tournament || !team) return;
    for (const [index, definition] of definitions.entries()) {
      const value = definition.combine(tournament.values[index], "tournament");
      if (value !== null) team.values[index].push(value);
    }
    tournament = undefined;
  }
  function finishTeam() {
    finishTournament();
    if (!team) return;
    const current = team;
    response.teams[String(current.number)] = {
      metrics: Object.fromEntries(
        requested.map((id) => {
          const index = indexes.get(id)!;
          return [
            id,
            {
              value: definitions[index].combine(current.values[index], "team"),
              samples: current.samples[index],
              version: registry.get(id).metadata.version,
            },
          ];
        }),
      ),
      ...(request.timeline ? { timeline: current.timeline } : {}),
    };
    team = undefined;
  }
  return {
    add(report: R) {
      if (closed) throw new Error("Analysis is already complete");
      if (!teamSet.has(report.teamNumber)) return;
      if (previous && compareReportGroups(previous, report) > 0)
        throw new RangeError(
          "Analysis report stream must be ordered by team, tournament and match",
        );
      previous = {
        uuid: report.uuid,
        teamNumber: report.teamNumber,
        matchKey: report.matchKey,
        tournamentKey: report.tournamentKey,
        tournamentDate: report.tournamentDate,
      };
      if (team?.number !== report.teamNumber) {
        finishTeam();
        team = {
          number: report.teamNumber,
          values: emptyValues(),
          samples: definitions.map(() => 0),
          timeline: [],
        };
      }
      if (
        tournament &&
        tournament.key === report.tournamentKey &&
        tournament.date !== report.tournamentDate
      )
        throw new RangeError("Inconsistent tournament dates");
      if (tournament?.key !== report.tournamentKey) {
        finishTournament();
        tournament = {
          key: report.tournamentKey,
          date: report.tournamentDate,
          values: emptyValues(),
        };
      }
      if (match?.key !== report.matchKey) {
        finishMatch();
        match = {
          key: report.matchKey,
          collectors: definitions.map((definition) => {
            if (definition.start) return definition.start();
            const facts: F[] = [];
            return {
              add: (value: F) => {
                facts.push(value);
              },
              finish: (dependencies) =>
                definition.evaluate(facts, dependencies),
            };
          }),
        };
      }
      const facts = prepare(report);
      for (const collector of match.collectors) collector.add(facts);
    },
    finish(): AnalysisResponse {
      if (closed) throw new Error("Analysis is already complete");
      finishTeam();
      for (const number of teamSet) {
        response.teams[String(number)] ??= {
          metrics: Object.fromEntries(
            requested.map((id) => [
              id,
              {
                value: registry.get(id).combine([], "team"),
                samples: 0,
                version: registry.get(id).metadata.version,
              },
            ]),
          ),
          ...(request.timeline ? { timeline: [] } : {}),
        };
      }
      closed = true;
      previous = undefined;
      return response;
    },
  };
}
export function analyzeGameReports<R extends ReportIdentity, F>(
  reports: readonly R[],
  request: AnalysisRequest,
  registry: MetricRegistry<F>,
  prepare: (report: R) => F,
): AnalysisResponse {
  const analysis = createGameAnalysis(request, registry, prepare);
  for (const report of [...reports].sort(compareReportGroups))
    analysis.add(report);
  return analysis.finish();
}
/** Sources must order match groups, so completed event payloads can be released. */
export async function analyzeGameReportStream<R extends ReportIdentity, F>(
  reports: AsyncIterable<R>,
  request: AnalysisRequest,
  registry: MetricRegistry<F>,
  prepare: (report: R) => F,
): Promise<AnalysisResponse> {
  const analysis = createGameAnalysis(request, registry, prepare);
  for await (const report of reports) analysis.add(report);
  return analysis.finish();
}

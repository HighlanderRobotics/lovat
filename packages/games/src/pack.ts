import { z } from "zod";
import {
  gamePredictionResultSchema,
  gameDescriptorSchema,
  type GameDescriptor,
  type GameRules,
  type AnalysisRequest,
  type AnalysisResponse,
  type GamePredictionResult,
} from "@lovat/api";
import { analyzeGameReports, type ReportIdentity } from "./engine.js";
import type { MetricRegistry } from "./registry.js";
import { GameError } from "./errors.js";
export interface StoredGameReport extends ReportIdentity {
  gameId: string;
  gameVersion: number;
  reportVersion: number;
  data: unknown;
}
type TeamAnalysis = AnalysisResponse["teams"][string];
export interface GamePrediction {
  metrics: readonly string[];
  calculate: (input: {
    red: readonly TeamAnalysis[];
    blue: readonly TeamAnalysis[];
  }) => GamePredictionResult;
}
export interface GamePack {
  prediction?: GamePrediction;
  readonly descriptor: GameDescriptor;
  readonly metrics: {
    resolve: (
      ids: readonly string[],
    ) => { metadata: GameDescriptor["metrics"][number] }[];
    get: (id: string) => { metadata: GameDescriptor["metrics"][number] };
    metadata: () => GameDescriptor["metrics"];
  };
  validate(
    data: unknown,
    reportVersion: number,
    context?: { startTime: number; endTime: number },
  ): Record<string, unknown>;
  plausible(
    data: unknown,
    reportVersion: number,
    officialScore?: number,
  ): boolean;
  analyze(
    reports: readonly StoredGameReport[],
    request: AnalysisRequest,
  ): AnalysisResponse;
}
export interface TypedGamePack<F> extends GamePack {
  /** For a trusted, typed storage adapter; never for client payloads. */
  fromFacts(identity: ReportIdentity, prepare: () => F): StoredGameReport;
}
export function defineGame<
  S extends z.ZodType<Record<string, unknown>>,
  F,
>(options: {
  id: string;
  season: number;
  version: number;
  label: string;
  rules: GameRules;
  report: { version: number; schema: S };
  olderReports?: readonly {
    version: number;
    schema: z.ZodType;
    upgrade: (data: unknown) => z.input<S>;
  }[];
  metrics: MetricRegistry<F>;
  prepare: (report: ReportIdentity & { data: z.output<S> }) => F;
  prediction?: GamePrediction;
  check?: (
    data: z.output<S>,
    context: { startTime: number; endTime: number },
  ) => void;
  assess?: (data: z.output<S>, officialScore?: number) => boolean;
}): TypedGamePack<F> {
  const prepared = new WeakMap<StoredGameReport, () => F>();
  const codecs = new Map<
    number,
    { schema: z.ZodType; upgrade?: (data: unknown) => z.input<S> }
  >();
  codecs.set(options.report.version, { schema: options.report.schema });
  for (const old of options.olderReports ?? []) {
    if (codecs.has(old.version)) throw Error("Duplicate report schema version");
    codecs.set(old.version, old);
  }
  const metadata = options.metrics.metadata();
  if (metadata.some((metric) => metric.season !== options.season))
    throw Error("Metric season does not match its game");
  const descriptor = gameDescriptorSchema.parse({
    id: options.id,
    season: options.season,
    version: options.version,
    label: options.label,
    reportVersion: options.report.version,
    reportSchemas: Object.fromEntries(
      [...codecs].map(([version, codec]) => [
        String(version),
        z.toJSONSchema(codec.schema),
      ]),
    ),
    rules: options.rules,
    metrics: metadata,
    features: { predictions: Boolean(options.prediction) },
  });
  const decode = (data: unknown, version: number): z.output<S> => {
    const codec = codecs.get(version);
    if (!codec)
      throw new GameError(
        409,
        "REPORT_VERSION_UNSUPPORTED",
        "Update Collection to a supported report version",
      );
    const parsed = codec.schema.safeParse(data);
    if (!parsed.success)
      throw new GameError(
        400,
        "INVALID_GAME_REPORT",
        "Report does not match the selected game's schema",
      );
    if (!codec.upgrade) return parsed.data as z.output<S>;
    const normalized = options.report.schema.safeParse(
      codec.upgrade ? codec.upgrade(parsed.data) : parsed.data,
    );
    if (!normalized.success)
      throw new GameError(
        400,
        "INVALID_GAME_REPORT",
        "Report cannot be read by the selected game",
      );
    return normalized.data;
  };
  return {
    fromFacts(identity, prepare) {
      const report = {
        ...identity,
        gameId: descriptor.id,
        gameVersion: descriptor.version,
        reportVersion: descriptor.reportVersion,
        data: undefined,
      };
      prepared.set(report, prepare);
      return report;
    },
    descriptor,
    metrics: options.metrics,
    validate: (data, version, context) => {
      const parsed = decode(data, version);
      if (context) options.check?.(parsed, context);
      return parsed;
    },
    plausible: (data, version, officialScore) =>
      options.assess?.(decode(data, version), officialScore) ?? true,
    prediction: options.prediction
      ? {
          metrics: options.prediction.metrics,
          calculate: (input) =>
            gamePredictionResultSchema.parse(
              options.prediction!.calculate(input),
            ),
        }
      : undefined,
    analyze(reports, request) {
      if (request.season !== descriptor.season)
        throw new GameError(
          400,
          "GAME_SEASON_MISMATCH",
          "Report season does not match the selected game",
        );
      for (const report of reports)
        if (
          report.gameId !== descriptor.id ||
          report.gameVersion !== descriptor.version
        )
          throw new GameError(
            409,
            "GAME_VERSION_MISMATCH",
            "Reports from different game contracts cannot be mixed",
          );
      return analyzeGameReports(
        reports,
        request,
        options.metrics,
        (report) =>
          prepared.get(report)?.() ??
          options.prepare({
            uuid: report.uuid,
            teamNumber: report.teamNumber,
            matchKey: report.matchKey,
            tournamentKey: report.tournamentKey,
            tournamentDate: report.tournamentDate,
            data: (() => {
              try {
                return decode(report.data, report.reportVersion);
              } catch (error) {
                if (
                  error instanceof GameError &&
                  error.code === "INVALID_GAME_REPORT"
                )
                  throw new Error("Stored game report is invalid");
                throw error;
              }
            })(),
          }),
      );
    },
  };
}
export class GameCatalog {
  private readonly bySeason = new Map<number, Map<number, GamePack>>();
  constructor(games: readonly GamePack[]) {
    for (const game of games) {
      const { season, version } = game.descriptor;
      let versions = this.bySeason.get(season);
      if (!versions) {
        versions = new Map();
        this.bySeason.set(season, versions);
      }
      if (versions.has(version)) throw Error("Duplicate game season/version");
      versions.set(version, game);
    }
  }
  get(season: number, version?: number): GamePack {
    const versions = this.bySeason.get(season);
    const selected = version ?? Math.max(...(versions?.keys() ?? []));
    const game = versions?.get(selected);
    if (!game)
      throw new GameError(
        400,
        "UNSUPPORTED_GAME",
        "This game season/version is not installed",
      );
    return game;
  }
  list() {
    return [...this.bySeason.values()]
      .flatMap((versions) =>
        [...versions.values()].map((game) => structuredClone(game.descriptor)),
      )
      .sort((a, b) => a.season - b.season || a.version - b.version);
  }
}

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUniqueOrThrow: vi.fn() }));

vi.mock("../src/prismaClient.js", () => ({
  default: {
    team: { findMany: vi.fn().mockResolvedValue([]) },
    tournament: { findMany: vi.fn().mockResolvedValue([]) },
    scoutReport: { findUniqueOrThrow: mocks.findUniqueOrThrow },
  },
}));

process.env.DOTENV_CONFIG_PATH = "/dev/null";
process.env.DATABASE_URL =
  "postgresql://lovat_test:lovat_test@127.0.0.1:5432/lovat_test";

const { AutoClimb, EndgameClimb, EventAction, Position } =
  await import("@lovat/db");
const { Metric } = await import("../src/handler/analysis/analysisConstants.js");
const { calculateScoutReportMetrics, computeAverageScoutReport } =
  await import("../src/handler/analysis/coreAnalysis/averageScoutReport.js");

type Input = Parameters<typeof calculateScoutReportMetrics>[0];
const event = (
  action: (typeof EventAction)[keyof typeof EventAction],
  time: number,
  points = 0,
  quantity: number | null = null,
): Input["events"][number] => ({
  action,
  position: Position.HUB,
  time,
  points,
  quantity,
});

const report = (overrides: Partial<Input> = {}): Input => ({
  endgameClimb: EndgameClimb.NOT_ATTEMPTED,
  autoClimb: AutoClimb.NOT_ATTEMPTED,
  driverAbility: 3,
  defenseEffectiveness: 0,
  events: [],
  ...overrides,
});

describe("single-report scoring metrics", () => {
  it("counts the autonomous boundary and both climb bonuses in the known total", () => {
    const input = report({
      autoClimb: AutoClimb.SUCCEEDED,
      endgameClimb: EndgameClimb.L2,
      events: [
        event(EventAction.STOP_SCORING, 23, 2, 2),
        event(EventAction.STOP_SCORING, 24, 3, 3),
      ],
    });

    expect(
      calculateScoutReportMetrics(input, [
        Metric.totalPoints,
        Metric.autoPoints,
        Metric.teleopPoints,
      ]),
    ).toEqual({
      [Metric.totalPoints]: 40,
      [Metric.autoPoints]: 17,
      [Metric.teleopPoints]: 3,
    });
  });

  it("pairs defense intervals and omits unfinished intervals", () => {
    const input = report({
      events: [
        event(EventAction.STOP_DEFENDING, 21),
        event(EventAction.START_DEFENDING, 20),
        event(EventAction.START_CAMPING, 30),
        event(EventAction.STOP_CAMPING, 32),
        event(EventAction.START_DEFENDING, 40),
      ],
    });
    expect(
      calculateScoutReportMetrics(input, [
        Metric.contactDefenseTime,
        Metric.campingDefenseTime,
        Metric.totalDefenseTime,
      ]),
    ).toEqual({
      [Metric.contactDefenseTime]: 1,
      [Metric.campingDefenseTime]: 2,
      [Metric.totalDefenseTime]: 3,
    });
  });

  it("excludes short feeding intervals from feeding time", () => {
    const input = report({
      events: [
        event(EventAction.START_FEEDING, 10),
        event(EventAction.STOP_FEEDING, 10.25),
        event(EventAction.START_FEEDING, 12),
        event(EventAction.STOP_FEEDING, 14, 0, 4),
      ],
    });
    expect(calculateScoutReportMetrics(input, [Metric.timeFeeding])).toEqual({
      [Metric.timeFeeding]: 2,
    });
  });

  it("uses the earliest event even when database events arrive out of order", () => {
    const input = report({
      events: [
        event(EventAction.STOP_SCORING, 20, 4, 4),
        event(EventAction.START_MATCH, 0),
      ],
    });
    expect(calculateScoutReportMetrics(input, [Metric.fuelPerSecond])).toEqual({
      [Metric.fuelPerSecond]: 0.2,
    });
  });

  it("handles a report with no events without inventing climb times", () => {
    expect(
      calculateScoutReportMetrics(report(), [
        Metric.totalPoints,
        Metric.autoPoints,
        Metric.teleopPoints,
        Metric.fuelPerSecond,
        Metric.feedingRate,
        Metric.autoClimbStartTime,
      ]),
    ).toEqual({
      [Metric.totalPoints]: 0,
      [Metric.autoPoints]: 0,
      [Metric.teleopPoints]: 0,
      [Metric.fuelPerSecond]: 0,
      [Metric.feedingRate]: 0,
    });
  });

  it("applies the same calculation to a report loaded from Prisma", async () => {
    mocks.findUniqueOrThrow.mockResolvedValueOnce(
      report({
        autoClimb: AutoClimb.SUCCEEDED,
        events: [event(EventAction.STOP_SCORING, 23, 2, 2)],
      }),
    );
    await expect(
      computeAverageScoutReport("synthetic-report", [Metric.totalPoints]),
    ).resolves.toEqual({ [Metric.totalPoints]: 17 });
    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uuid: "synthetic-report" } }),
    );
  });
});

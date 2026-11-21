import { expect, test } from "bun:test";
import { runMaintenance } from "../src/jobs/maintenance";
import { day } from "../src/schedule";

const enabled = process.env.LOVAT_DB_TEST === "1";

test.skipIf(!enabled)(
  "maintenance preserves live and submitted drafts and scrubs old abandoned payloads",
  async () => {
    const url = new URL(
      process.env.DATABASE_URL ?? "postgresql://localhost/missing",
    );
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/lovat_test"
    ) {
      throw new Error("Use only a disposable local lovat_test database");
    }
    const { createDb } = await import("@lovat/db");
    const db = createDb(url.href);
    const fixture = crypto.randomUUID();
    const number = 8_000_000 + Math.floor(Math.random() * 1_000_000);
    const now = new Date();
    try {
      await db.team.create({ data: { number, name: "Maintenance fixture" } });
      await db.registeredTeam.create({
        data: {
          number,
          code: fixture,
          email: "fixture@example.invalid",
          emailVerified: true,
          timeCreated: new Date(0),
        },
      });
      const scouter = await db.scouter.create({
        data: { sourceTeamNumber: number },
      });
      for (const [suffix, status, age] of [
        ["live", "LOADED", -day],
        ["expired", "STARTED", 0],
        ["old", "ENDED", 24 * day],
        ["submitted", "SUBMITTED", 24 * day],
      ] as const) {
        await db.scoutReportInProgress.create({
          data: {
            uuid: `${fixture}-${suffix}`,
            sourceTeamNumber: number,
            scouterUuid: scouter.uuid,
            deviceId: fixture,
            seasonYear: 2026,
            schemaVersion: 1,
            mode: "COMPETITION",
            status,
            tournamentKey: "2026fixture",
            matchType: "QUALIFICATION",
            matchNumber: 1,
            teamNumber: number,
            ...(status === "SUBMITTED"
              ? { startedAt: now, endedAt: now, submittedAt: now }
              : {}),
            payload: { fixture: true },
            expiresAt: new Date(now.getTime() - age),
          },
        });
      }
      for (const [suffix, age] of [
        ["expired", day],
        ["live", -day],
      ] as const) {
        await db.emailVerificationRequest.create({
          data: {
            verificationCode: `${fixture}-${suffix}`,
            email: "fixture@example.invalid",
            teamNumber: number,
            expiresAt: new Date(now.getTime() - age),
          },
        });
      }
      await runMaintenance(db, now);
      await runMaintenance(db, now);
      const rows = await db.scoutReportInProgress.findMany({
        where: { sourceTeamNumber: number },
      });
      expect(rows.find((r) => r.uuid.endsWith("-live"))?.status).toBe("LOADED");
      expect(rows.find((r) => r.uuid.endsWith("-expired"))?.status).toBe(
        "ABANDONED",
      );
      expect(rows.find((r) => r.uuid.endsWith("-expired"))?.payload).toEqual({
        fixture: true,
      });
      expect(rows.find((r) => r.uuid.endsWith("-old"))?.payload).toEqual({});
      expect(rows.find((r) => r.uuid.endsWith("-submitted"))?.payload).toEqual({
        fixture: true,
      });
      expect(rows.find((r) => r.uuid.endsWith("-submitted"))?.status).toBe(
        "SUBMITTED",
      );
      expect(
        await db.emailVerificationRequest.count({
          where: { teamNumber: number },
        }),
      ).toBe(1);
      expect(await db.registeredTeam.count({ where: { number } })).toBe(1);
    } finally {
      await db.team.deleteMany({ where: { number } });
      await db.emailVerificationRequest.deleteMany({
        where: { teamNumber: number },
      });
      await db.$disconnect();
    }
  },
);

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { runNextEffect } from "../src/outbox";
const enabled = process.env.LOVAT_DB_TEST === "1";
const prefix = "outbox-fixture-" + crypto.randomUUID();
const now = new Date("2000-01-01T00:00:00Z");
let db: PrismaClient;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  );
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test"
  )
    throw new Error("Use a disposable loopback lovat_test database");
  const { createDb } = await import("@lovat/db");
  db = createDb(url.href, { maxConnections: 4 });
});
afterAll(async () => {
  if (db) {
    await db.apiOutbox.deleteMany({
      where: { dedupeKey: { startsWith: prefix } },
    });
    await db.$disconnect();
  }
});
const add = (suffix: string, extras = {}) =>
  db.apiOutbox.create({
    data: {
      dedupeKey: prefix + suffix,
      kind: "cache.revision",
      payload: { kind: "cache.revision", teamNumber: 1, revision: "1" },
      availableAt: now,
      ...extras,
    },
  });
test.skipIf(!enabled)(
  "outbox claims once across concurrent workers",
  async () => {
    const row = await add("-claim");
    let deliveries = 0;
    const delivery = {
      deliver: async () => {
        deliveries++;
        await Bun.sleep(10);
      },
    };
    await Promise.all([
      runNextEffect(db, delivery, now),
      runNextEffect(db, delivery, now),
    ]);
    expect(deliveries).toBe(1);
    const saved = await db.apiOutbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(saved.attempts).toBe(1);
    expect(saved.completedAt).not.toBeNull();
    expect(saved.leaseToken).toBeNull();
  },
);
test.skipIf(!enabled)(
  "delivery failures retry without completing or exposing provider secrets",
  async () => {
    const row = await add("-failure");
    await runNextEffect(
      db,
      {
        deliver: async () => {
          throw Error("secret-provider-response");
        },
      },
      now,
    );
    const saved = await db.apiOutbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(saved.completedAt).toBeNull();
    expect(saved.leaseToken).toBeNull();
    expect(saved.lastError).toBe("DELIVERY_FAILED");
    expect(saved.availableAt.getTime()).toBeGreaterThan(Date.now());
  },
);
test.skipIf(!enabled)(
  "expired leases are reclaimed while active leases remain untouched",
  async () => {
    const row = await add("-lease", {
      leaseToken: "crashed",
      leaseUntil: new Date(now.getTime() + 1000),
    });
    let deliveries = 0;
    expect(
      await runNextEffect(
        db,
        {
          deliver: async () => {
            deliveries++;
          },
        },
        now,
      ),
    ).toBe(false);
    expect(
      await runNextEffect(
        db,
        {
          deliver: async () => {
            deliveries++;
          },
        },
        new Date(now.getTime() + 2000),
      ),
    ).toBe(true);
    expect(deliveries).toBe(1);
    expect(
      (await db.apiOutbox.findUniqueOrThrow({ where: { id: row.id } }))
        .completedAt,
    ).not.toBeNull();
  },
);
test.skipIf(!enabled)(
  "malformed effects never reach external delivery",
  async () => {
    const row = await add("-invalid", {
      payload: { kind: "cache.revision", teamNumber: 1, revision: "NaN" },
    });
    let deliveries = 0;
    await runNextEffect(
      db,
      {
        deliver: async () => {
          deliveries++;
        },
      },
      now,
    );
    expect(deliveries).toBe(0);
    expect(
      (await db.apiOutbox.findUniqueOrThrow({ where: { id: row.id } }))
        .lastError,
    ).toBe("DELIVERY_FAILED");
  },
);

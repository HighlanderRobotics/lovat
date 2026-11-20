import { expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import {
  hasCompetitionDates,
  runScheduledWindow,
} from "../src/scheduled-window";

const event = {
  startDate: new Date("2026-11-21Z"),
  endDate: new Date("2026-11-21Z"),
  timezone: "America/Chicago",
};
test("competition windows include local midnight and the last day after UTC midnight", async () => {
  const db = {
    tournament: { findMany: async () => [event] },
  } as unknown as PrismaClient;
  expect(await hasCompetitionDates(db, new Date("2026-11-21T05:59Z"))).toBe(
    false,
  );
  expect(await hasCompetitionDates(db, new Date("2026-11-21T06:00Z"))).toBe(
    true,
  );
  expect(await hasCompetitionDates(db, new Date("2026-11-22T05:59Z"))).toBe(
    true,
  );
  expect(await hasCompetitionDates(db, new Date("2026-11-22T06:00Z"))).toBe(
    false,
  );
});

test("non-competition windows run a finite batch and disconnect", async () => {
  let batches = 0;
  let disconnected = false;
  const db = {
    $disconnect: async () => {
      disconnected = true;
    },
  } as unknown as PrismaClient;
  await runScheduledWindow(db, new AbortController().signal, 2, {
    hasCompetitionDates: async () => false,
    runBatch: async () => {
      batches++;
    },
    runWorker: async () => {
      throw new Error("unexpected continuous mode");
    },
  });
  expect(batches).toBe(1);
  expect(disconnected).toBe(true);
});

test("competition windows keep minute polling until all event-local dates finish, then drain", async () => {
  let checks = 0;
  let disconnected = false;
  const db = {
    $disconnect: async () => {
      disconnected = true;
    },
  } as unknown as PrismaClient;
  await runScheduledWindow(db, new AbortController().signal, 2, {
    hasCompetitionDates: async () => ++checks < 3,
    runBatch: async () => {
      throw new Error("unexpected batch");
    },
    runWorker: async (_db, signal, _concurrency, onReconciled) => {
      await onReconciled?.();
      expect(signal.aborted).toBe(false);
      await onReconciled?.();
      expect(signal.aborted).toBe(true);
      expect(disconnected).toBe(false);
    },
  });
  expect(disconnected).toBe(true);
});

test("calendar query failure disconnects instead of starting stale event mode", async () => {
  let disconnected = false;
  const db = {
    $disconnect: async () => {
      disconnected = true;
    },
  } as unknown as PrismaClient;
  await expect(
    runScheduledWindow(db, new AbortController().signal, 2, {
      hasCompetitionDates: async () => {
        throw new Error("database unavailable");
      },
      runBatch: async () => {},
      runWorker: async () => {},
    }),
  ).rejects.toThrow("database unavailable");
  expect(disconnected).toBe(true);
});

test("a catalog batch discovering today's event immediately enters continuous mode", async () => {
  let discovered = false;
  let continuous = false;
  const db = { $disconnect: async () => {} } as unknown as PrismaClient;
  await runScheduledWindow(db, new AbortController().signal, 2, {
    hasCompetitionDates: async () => discovered,
    runBatch: async () => {
      discovered = true;
    },
    runWorker: async () => {
      continuous = true;
    },
  });
  expect(continuous).toBe(true);
});

test("catalog discovery stops new batch claims before draining the snapshot backlog", async () => {
  let active = false;
  let entered = false;
  const db = { $disconnect: async () => {} } as unknown as PrismaClient;
  await runScheduledWindow(db, new AbortController().signal, 2, {
    hasCompetitionDates: async () => active,
    runBatch: async (_db, signal, _concurrency, _deps, settled) => {
      active = true;
      await settled?.();
      expect(signal.aborted).toBe(true);
    },
    runWorker: async () => {
      entered = true;
    },
  });
  expect(entered).toBe(true);
});

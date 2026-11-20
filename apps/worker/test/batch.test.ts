import { expect, test } from "bun:test";
import type { PrismaClient } from "@lovat/db";
import { runBatch } from "../src/worker";

function fixture(ids = ["a", "b", "c"]) {
  let disconnected = false;
  const db = {
    importJob: { findMany: async () => ids.map((id) => ({ id })) },
    $disconnect: async () => {
      disconnected = true;
    },
  } as unknown as PrismaClient;
  return { db, disconnected: () => disconnected };
}

test("batch processes each snapshot member once with bounded concurrency and disconnects", async () => {
  const f = fixture();
  const seen: string[] = [];
  let running = 0;
  let peak = 0;
  await runBatch(f.db, new AbortController().signal, 2, {
    reconcileSchedule: async () => {},
    runNextJob: async (_db, _execute, claim) => {
      seen.push(claim!.id);
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      expect(f.disconnected()).toBe(false);
      running--;
      return true;
    },
  });
  expect(seen.sort()).toEqual(["a", "b", "c"]);
  expect(peak).toBe(2);
  expect(f.disconnected()).toBe(true);
});

test("batch waits for other consumers before disconnecting on claim failure", async () => {
  const f = fixture();
  let drained = false;
  await expect(
    runBatch(f.db, new AbortController().signal, 2, {
      reconcileSchedule: async () => {},
      runNextJob: async (_db, _execute, claim) => {
        if (claim!.id === "a") throw new Error("claim failed");
        await new Promise((resolve) => setTimeout(resolve, 2));
        expect(f.disconnected()).toBe(false);
        drained = true;
        return true;
      },
    }),
  ).rejects.toThrow("claim failed");
  expect(drained).toBe(true);
  expect(f.disconnected()).toBe(true);
});

test("abort drains current work without new claims", async () => {
  const f = fixture();
  const controller = new AbortController();
  const seen: string[] = [];
  await runBatch(f.db, controller.signal, 1, {
    reconcileSchedule: async () => {},
    runNextJob: async (_db, _execute, claim) => {
      seen.push(claim!.id);
      controller.abort();
      return true;
    },
  });
  expect(seen).toEqual(["a"]);
  expect(f.disconnected()).toBe(true);
});

test("planner failure and invalid concurrency also disconnect", async () => {
  for (const concurrency of [0, 2]) {
    const f = fixture();
    await expect(
      runBatch(f.db, new AbortController().signal, concurrency, {
        reconcileSchedule: async () => {
          throw new Error("planner failed");
        },
        runNextJob: async () => false,
      }),
    ).rejects.toThrow();
    expect(f.disconnected()).toBe(true);
  }
});

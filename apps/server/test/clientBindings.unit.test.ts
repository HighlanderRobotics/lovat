import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: {},
  options: undefined as
    | undefined
    | {
        disableGeoip: boolean;
        before_send: (event: {
          properties: Record<string, unknown>;
        }) => unknown;
      },
}));
vi.mock("@lovat/db", () => ({ db: mocks.db }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(_key: string, options: NonNullable<typeof mocks.options>) {
      mocks.options = options;
    }
  },
}));
import prisma from "../src/prismaClient.js";
import { posthog } from "../src/posthogClient.js";
import { ENVIRONMENT } from "../src/lib/environment.js";
it("shares the canonical database client without creating another connection", () => {
  expect(prisma).toBe(mocks.db);
});
it("adds deployment context to outgoing analytics while preserving properties", () => {
  expect(posthog).toBeDefined();
  expect(mocks.options?.disableGeoip).toBe(true);
  const event = { properties: { example: "synthetic" } };
  expect(mocks.options?.before_send(event)).toBe(event);
  expect(event.properties).toEqual({
    example: "synthetic",
    environment: ENVIRONMENT,
    eventSource: "server",
  });
});

import { afterAll, afterEach, expect, vi } from "vitest";

const outbound = vi.hoisted(() => ({ requests: [] as string[] }));
const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

const checkUrl = (value: string): void => {
  const url = new URL(value);
  if (!loopbackHosts.has(url.hostname)) {
    outbound.requests.push(value);
    throw new Error(`Unexpected outbound HTTP request: ${value}`);
  }
};

const originalFetch = globalThis.fetch;
vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  checkUrl(url);
  return originalFetch(input, init);
});

vi.mock("axios", () => ({
  default: {
    get: vi.fn((url: string) => {
      checkUrl(url);
      return Promise.reject(new Error(`Unstubbed local HTTP request: ${url}`));
    }),
  },
}));

const assertNoOutbound = () => {
  const requests = outbound.requests.splice(0);
  expect(requests).toEqual([]);
};

afterEach(assertNoOutbound);
afterAll(assertNoOutbound);

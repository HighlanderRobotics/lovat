import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const timeoutMs = 12_000;
const bodyLimit = 32 * 1024;
const checks = [
  {
    name: "Website home",
    url: "https://lovat.app/",
    mime: "text/html",
    html: /<title>\s*Lovat\s*(?:—|&mdash;|&#8212;)\s*Centralize your team/i,
  },
  {
    name: "Learn root redirect",
    url: "https://learn.lovat.app/",
    redirect: "https://learn.lovat.app/guides/welcome/",
  },
  {
    name: "Learn Welcome guide",
    url: "https://learn.lovat.app/guides/welcome/",
    mime: "text/html",
    html: /<title>\s*Welcome\b/i,
  },
  {
    name: "Dashboard web shell",
    url: "https://dashboard.lovat.app/",
    mime: "text/html",
    html: /<title>\s*Lovat\s*<\/title>/i,
  },
  {
    name: "Dashboard application script",
    url: "https://dashboard.lovat.app/main.dart.js",
    mime: ["text/javascript", "application/javascript", "application/x-javascript"],
  },
  {
    name: "API process status",
    url: "https://api.lovat.app/status",
    exact: "Server running",
  },
  {
    name: "API version contract",
    url: "https://api.lovat.app/version",
    mime: "application/json",
    validate: (body) => {
      const version = JSON.parse(body);
      return (
        typeof version?.version === "string" &&
        /^\d+\.\d+\.\d+$/.test(version.version) &&
        typeof version.gitCommit === "string" &&
        version.gitCommit.length > 0
      );
    },
  },
];

async function readPrefix(body, limit, pattern) {
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let remaining = limit;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return { text: text + decoder.decode(), truncated: false };

      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      if (pattern?.test(text)) return { text, truncated: false };

      remaining -= value.length;
      if (remaining <= 0) return { text, truncated: true };
    }
  } finally {
    // Cancelling prevents reading the full HTML or asset on a smoke request.
    void reader.cancel().catch(() => {});
  }
}

async function probe(check, fetcher, deadline) {
  let response;
  try {
    response = await fetcher(check.url, {
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      signal: deadline,
    });

    const { status } = response;
    if (status >= 500 || status === 429) {
      return { status, reason: "transient HTTP status", retryable: true };
    }

    if (check.redirect) {
      let destination;
      try {
        const location = response.headers.get("location");
        if (location) destination = new URL(location, check.url).href;
      } catch {
        // Invalid redirect locations fail without logging response content.
      }
      return [302, 307].includes(status) && destination === check.redirect
        ? { status }
        : { status, reason: "unexpected redirect" };
    }

    if (status !== 200) return { status, reason: "unexpected HTTP status" };

    if (check.mime) {
      const mediaType = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      if (![check.mime].flat().includes(mediaType)) {
        return { status, reason: "unexpected content type" };
      }
    }

    if (check.html || check.exact || check.validate) {
      const { text, truncated } = await readPrefix(
        response.body,
        check.html ? bodyLimit : 4096,
        check.html,
      );
      try {
        const valid = check.html
          ? check.html.test(text)
          : !truncated && (check.validate ? check.validate(text) : text.trim() === check.exact);
        if (!valid) return { status, reason: "unexpected response content" };
      } catch {
        return { status, reason: "unexpected response content" };
      }
    }
    return { status };
  } catch {
    return {
      status: response?.status ?? null,
      reason: deadline.aborted ? "request timed out" : "network or response read error",
      retryable: true,
    };
  } finally {
    if (response?.body && !response.body.locked) {
      void response.body.cancel().catch(() => {});
    }
  }
}

export async function runDeploymentSmoke({
  fetcher = fetch,
  pause = delay,
  makeDeadline = () => AbortSignal.timeout(timeoutMs),
} = {}) {
  return Promise.all(
    checks.map(async (check) => {
      const started = performance.now();
      const first = await probe(check, fetcher, makeDeadline());
      if (first.retryable) await pause(1000);
      const last = first.retryable
        ? await probe(check, fetcher, makeDeadline())
        : first;

      return {
        name: check.name,
        url: check.url,
        ok: !last.reason,
        status: last.status,
        attempts: first.retryable ? 2 : 1,
        durationMs: Math.round(performance.now() - started),
        ...(first.retryable && {
          firstAttempt: { status: first.status, reason: first.reason },
        }),
        ...(last.reason && { reason: last.reason }),
      };
    }),
  );
}

async function main() {
  if (process.argv.length !== 2) {
    console.error("Usage: node scripts/deployment-smoke.mjs (no arguments)");
    process.exitCode = 2;
    return;
  }

  console.log(`Lovat public production smoke | ${new Date().toISOString()}`);
  const results = await runDeploymentSmoke();
  for (const check of results) {
    const status = check.status === null ? "no HTTP response" : `HTTP ${check.status}`;
    const prior = check.firstAttempt
      ? `; first attempt: ${check.firstAttempt.reason}${check.firstAttempt.status === null ? "" : ` (HTTP ${check.firstAttempt.status})`}`
      : "";
    const problem = check.reason ? `; ${check.reason}` : "";
    console.log(
      `${check.ok ? "PASS" : "FAIL"} ${check.name} [${check.url}]: ${status}, ${check.durationMs}ms, ${check.attempts} attempt(s)${prior}${problem}`,
    );
  }
  const passed = results.filter((check) => check.ok).length;
  console.log(`${passed}/${results.length} public checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

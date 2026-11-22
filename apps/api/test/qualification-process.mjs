import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
export async function startQualificationService(executable, app, env) {
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const scratch = fileURLToPath(
    new URL("../../../.migration-work/", import.meta.url),
  );
  await mkdir(scratch, { recursive: true });
  // An empty cwd and explicit environment prevent loading any private app .env.
  const cwd = await mkdtemp(join(scratch, "qualification-"));
  const inherited = Object.fromEntries(
    ["PATH", "SystemRoot", "TEMP", "TMP", "LOCALAPPDATA"]
      .filter((name) => process.env[name])
      .map((name) => [name, process.env[name]]),
  );
  const child = Bun.spawn(
    [
      executable,
      fileURLToPath(
        new URL(
          "../../" + app + "/tools/serve-qualification.mjs",
          import.meta.url,
        ),
      ),
    ],
    {
      cwd,
      env: { ...inherited, ...env, LOVAT_LOCAL_QUALIFICATION: "1" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const diagnostics = new Response(child.stderr).text();
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.type === "ready") resolveReady(message.url);
        } catch {
          /* Other process logs are not protocol messages. */
        }
      }
    }
  })().catch(rejectReady);
  child.exited.then((code) =>
    rejectReady(Error("Qualification service exited " + code)),
  );
  const timer = setTimeout(() => {
    child.kill();
    rejectReady(Error("Qualification startup timed out"));
  }, 30000);
  let url;
  try {
    url = await ready;
  } catch (error) {
    child.kill();
    throw Error(error.message + ": " + (await diagnostics).slice(-2000));
  } finally {
    clearTimeout(timer);
  }
  return {
    url,
    async stop() {
      if (child.exitCode === 0) return;
      if (child.exitCode !== null)
        throw Error("Qualification service exited unexpectedly");
      child.stdin.write(JSON.stringify({ type: "stop" }) + "\n");
      child.stdin.end();
      const deadline = setTimeout(() => child.kill(), 20000);
      try {
        if ((await child.exited) !== 0)
          throw Error(
            "Qualification shutdown failed: " +
              (await diagnostics).slice(-2000),
          );
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}

import { URL } from "node:url";
import process from "node:process";
import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
const scout = "22222222-2222-4222-8222-222222222222";
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let body = "";
  for await (const chunk of req) body += chunk;
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/healthz") {
    res.end("{}");
    return;
  }
  if (url.pathname === "/collection/checkcode") {
    res.end(
      JSON.stringify({
        number: 4321,
        code: "SYNTHETIC",
        email: "test@example.invalid",
        emailVerified: true,
        teamApproved: true,
        website: null,
      }),
    );
    return;
  }
  if (url.pathname === "/collection/scouter") {
    res.end(
      JSON.stringify([
        {
          name: "Synthetic Scout",
          uuid: scout,
          sourceTeamNumber: 4321,
          strikes: 0,
          scouterReliability: 1,
        },
      ]),
    );
    return;
  }
  if (url.pathname === "/collection/tournament") {
    res.end(
      JSON.stringify({
        tournaments: [
          {
            key: "2026test",
            name: "Synthetic Event",
            location: "Local fixture",
            date: "2026-01-01",
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname === "/collection/schedules/2026test") {
    res.end(
      JSON.stringify({
        hash: "synthetic",
        data: [
          {
            matchType: 0,
            matchNumber: 1,
            scouters: { [scout]: { team: 1234, alliance: "red" } },
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname === "/v1/manager/matchschedule/2026test") {
    res.end(
      JSON.stringify({
        tournamentKey: "2026test",
        matches: [
          {
            matchType: 0,
            matchNumber: 1,
            teams: [{ number: 1234, alliance: "red" }],
          },
        ],
      }),
    );
    return;
  }
  if (
    req.method === "POST" &&
    [
      "/collection/load",
      "/collection/start",
      "/collection/end",
      "/collection/submit",
      "/collection/scoutreports",
    ].includes(url.pathname)
  ) {
    const data = JSON.parse(body);
    if (process.env.NATIVE_LEDGER)
      await appendFile(
        process.env.NATIVE_LEDGER,
        JSON.stringify({ path: url.pathname, uuid: data.uuid }) + "\n",
      );
    res.end("{}");
    return;
  }
  res.statusCode = 404;
  res.end(
    JSON.stringify({ displayError: "Unknown synthetic fixture endpoint" }),
  );
});
server.listen(9877, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());

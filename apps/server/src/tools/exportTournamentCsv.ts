import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Response } from "express";
import prisma from "../prismaClient.js";
import { closeRedis } from "../redisClient.js";
import type { AuthenticatedRequest } from "../lib/middleware/requireAuth.js";
import { getOcrCSV } from "../handler/analysis/csv/getOcrCSV.js";
import { getTeamCSV } from "../handler/analysis/csv/getTeamCSV.js";
import { exportQuery } from "../handler/analysis/csv/tournamentResults.js";

// Operator command: run inside the API service, using an existing user's
// visibility rules and verified team. No report, estimate, or queue writes.
const [tournamentKey, userId, directory] = process.argv.slice(2);
if (!directory || !userId || !exportQuery.safeParse({ tournamentKey }).success)
  throw Error(
    "Usage: exportTournamentCsv <tournamentKey> <userId> <directory>",
  );

try {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const team = user?.teamNumber
    ? await prisma.registeredTeam.findUnique({
        where: { number: user.teamNumber },
        select: { emailVerified: true },
      })
    : null;
  if (!user || !team?.emailVerified)
    throw Error("A user with a verified team is required");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const [name, handler] of [
    ["ocr", getOcrCSV],
    ["teams", getTeamCSV],
  ] as const) {
    let status = 200;
    let body: unknown;
    const response = {
      status(code: number) {
        status = code;
        return response;
      },
      header() {
        return response;
      },
      attachment() {
        return response;
      },
      send(value: unknown) {
        body = value;
        return response;
      },
    };
    await handler(
      {
        user,
        query: {
          tournamentKey,
          fixedPoints: "true",
          winstreak: "true",
          trend: "true",
        },
      } as unknown as AuthenticatedRequest,
      response as unknown as Response,
    );
    if (status !== 200 || typeof body !== "string")
      throw Error(`${name} export failed (${status})`);
    const path = join(directory, `${tournamentKey}-${name}.csv`);
    await writeFile(path, body, { mode: 0o600 });
    console.info(
      JSON.stringify({
        export: name,
        tournamentKey,
        bytes: Buffer.byteLength(body),
        path,
      }),
    );
  }
} finally {
  await closeRedis();
  await prisma.$disconnect();
}

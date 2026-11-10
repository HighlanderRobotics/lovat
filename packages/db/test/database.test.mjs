import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

// This suite writes fixtures. Only run it against the disposable test database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/missing");
if (process.env.LOVAT_DB_TEST !== "1" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lovat_test") {
  throw new Error("Use LOVAT_DB_TEST=1 and a local lovat_test database");
}
const { db, Prisma, UserRole } = await import("../dist/index.js");

test("shared client supports writes, relations, JSON, enums, errors and rollback", async () => {
  const id = randomUUID();
  const teamNumber = -Math.floor(Math.random() * 2_000_000_000) - 1;
  try {
    await db.team.create({ data: { number: teamNumber, name: "Database integration test" } });
    await db.registeredTeam.create({
      data: { number: teamNumber, code: id, email: `${id}@example.invalid` },
    });
    await db.user.create({
      data: { id, email: `${id}@example.invalid`, teamNumber, role: UserRole.SCOUTING_LEAD },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id }, include: { team: { include: { team: true } } } });
    assert.equal(user.team.team.name, "Database integration test");
    assert.equal(user.role, UserRole.SCOUTING_LEAD);
    assert.deepEqual(user.teamSourceRule, { mode: "EXCLUDE", items: [] });
    await db.user.update({ where: { id }, data: { teamSourceRule: { mode: "INCLUDE", items: [8033] } } });
    assert.deepEqual((await db.user.findUniqueOrThrow({ where: { id } })).teamSourceRule, { mode: "INCLUDE", items: [8033] });
    await assert.rejects(db.user.create({ data: { id, email: `${id}@example.invalid` } }),
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { username: "must roll back" } });
      throw new Error("deliberate rollback");
    }), /deliberate rollback/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).username, null);
    const [count, rows] = await db.$transaction([
      db.user.count({ where: { id } }),
      db.$queryRaw`SELECT ${id}::text AS id`,
    ]);
    assert.equal(count, 1);
    assert.equal(rows[0].id, id);
  } finally {
    await db.team.deleteMany({ where: { number: teamNumber } });
    await db.$disconnect();
  }
});

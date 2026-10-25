import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../src/lib/middleware/requireAuth.js";
import { createCustomPostMatchHandlers } from "../src/handler/manager/customPostMatch.js";
import {
  customPostMatchAnswersSchema,
  customPostMatchCSV,
  customPostMatchQuestionsSchema,
} from "../src/lib/customPostMatch.js";
import { stringify } from "csv-stringify/sync";

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
  };
}
function setup() {
  const teams = new Map([
    [8033, { number: 8033, customPostMatch: ["Did it recover?"] }],
    [254, { number: 254, customPostMatch: ["Other team's question"] }],
  ]);
  let updates = 0;
  const handlers = createCustomPostMatchHandlers({
    readByCode: async (code) =>
      code === "own-team-code" ? teams.get(8033)! : null,
    readByTeam: async (number) => teams.get(number) ?? null,
    update: async (number, customPostMatch) => {
      updates++;
      const team = { number, customPostMatch };
      teams.set(number, team);
      return team;
    },
  });
  return { handlers, teams, updates: () => updates };
}
const request = (overrides = {}) =>
  ({
    user: { role: "SCOUTING_LEAD", teamNumber: 8033 },
    tokenType: "jwt",
    headers: {},
    body: { customPostMatch: ["New question"] },
    ...overrides,
  }) as unknown as AuthenticatedRequest;

test("Collection authenticates by team code and cannot select a different team's questions", async () => {
  const { handlers } = setup();
  for (const code of [undefined, "bad-code", ["own-team-code"]]) {
    const res = response();
    await handlers.collection(
      { headers: { "x-team-code": code } } as unknown as Request,
      res as unknown as Response,
    );
    assert.equal(res.statusCode, 401);
  }
  const res = response();
  await handlers.collection(
    {
      headers: { "x-team-code": "own-team-code" },
      query: { teamNumber: 254 },
    } as unknown as Request,
    res as unknown as Response,
  );
  assert.deepEqual(res.body, {
    teamNumber: 8033,
    customPostMatch: ["Did it recover?"],
  });
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});

test("only a signed-in lead can update their own team", async () => {
  const { handlers, teams, updates } = setup();
  for (const req of [
    request({ user: { role: "ANALYST", teamNumber: 8033 } }),
    request({ tokenType: "apiKey" }),
    request({ user: { role: "SCOUTING_LEAD", teamNumber: null } }),
  ]) {
    const res = response();
    await handlers.update(req, res as unknown as Response);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(updates(), 0);
  const res = response();
  await handlers.update(
    request({
      body: { teamNumber: 254, customPostMatch: ["  Own question  "] },
    }),
    res as unknown as Response,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(teams.get(8033)?.customPostMatch, ["Own question"]);
  assert.deepEqual(teams.get(254)?.customPostMatch, ["Other team's question"]);
  const cleared = response();
  await handlers.update(
    request({ body: { customPostMatch: [] } }),
    cleared as unknown as Response,
  );
  assert.deepEqual(teams.get(8033)?.customPostMatch, []);
});

test("limits and duplicate checks apply to settings and uploaded answers", async () => {
  const { handlers, updates } = setup();
  for (const customPostMatch of [
    ["1", "2", "3", "4"],
    [" "],
    ["x", " x "],
    ["a".repeat(301)],
  ]) {
    const res = response();
    await handlers.update(
      request({ body: { customPostMatch } }),
      res as unknown as Response,
    );
    assert.equal(res.statusCode, 400);
  }
  assert.equal(updates(), 0);
  assert.equal(
    customPostMatchQuestionsSchema.safeParse(["1", "2", "3"]).success,
    true,
  );
  assert.equal(
    customPostMatchAnswersSchema.safeParse([
      { question: "Old wording", answer: "" },
    ]).success,
    true,
  );
  assert.equal(
    customPostMatchAnswersSchema.safeParse([
      { question: "Old wording", answer: "x".repeat(2001) },
    ]).success,
    false,
  );
  assert.equal(
    customPostMatchAnswersSchema.safeParse(
      Array.from({ length: 4 }, (_, i) => ({
        question: String(i),
        answer: "yes",
      })),
    ).success,
    false,
  );
});

test("CSV keeps snapshot wording, blank legacy columns and multiline free text", () => {
  const snapshot = [
    {
      question: 'Old question, "before edit"',
      answer: 'First line, details\nSecond "line"',
    },
  ];
  const cells = customPostMatchCSV(snapshot);
  assert.equal(cells.customQuestion1, snapshot[0].question);
  assert.equal(cells.customAnswer1, snapshot[0].answer);
  assert.equal(cells.customAnswer3, "");
  assert.deepEqual(Object.values(customPostMatchCSV(undefined)), [
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const csv = stringify([cells], { header: true });
  assert.ok(csv.includes('"Old question, ""before edit"""'));
  assert.ok(csv.includes('"First line, details\nSecond ""line"""'));
  assert.equal(
    customPostMatchCSV([{ question: "=1+1", answer: "  @SUM(A1)" }])
      .customAnswer1,
    "'  @SUM(A1)",
  );
});

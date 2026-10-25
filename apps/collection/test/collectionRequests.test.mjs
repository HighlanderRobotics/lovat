import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sendReport,
  sendReportLifecycle,
} from "../lib/lovatAPI/collectionRequests.ts";

const meta = {
  scouterUUID: "scout",
  teamNumber: 254,
  matchIdentity: {
    tournamentKey: "2026test",
    matchType: "PLAYOFF",
    matchNumber: 7,
  },
  collection: { sourceTeamNumber: 8033, endTime: 2000 },
};
const report = { uuid: "client-uuid", startTime: 1000 };
const recorder = (failAt) => {
  const calls = [];
  return {
    calls,
    post: async (path, body) => {
      calls.push({ path, body });
      return {
        ok: path !== failAt,
        json: async () => ({ displayError: "Offline retry needed" }),
      };
    },
  };
};

test("loads manual playoffs without guessing the canonical match key", async () => {
  const { post, calls } = recorder();
  await sendReportLifecycle(post, report.uuid, {
    ...meta,
    collection: { sourceTeamNumber: 8033 },
  });
  assert.deepEqual(calls, [
    {
      path: "/collection/load",
      body: {
        uuid: "client-uuid",
        teamNumber: 254,
        matchIdentity: {
          tournamentKey: "2026test",
          matchType: "ELIMINATION",
          matchNumber: 7,
        },
        trainingAttemptUuid: undefined,
      },
    },
  ]);
});

test("replays offline lifecycle in order with original UUID and timestamps", async () => {
  const { post, calls } = recorder();
  await sendReport(post, report, meta);
  assert.deepEqual(
    calls.map(({ path }) => path),
    [
      "/collection/load",
      "/collection/start",
      "/collection/end",
      "/collection/submit",
    ],
  );
  assert.deepEqual(calls[1].body, { uuid: "client-uuid", startTime: 1000 });
  assert.deepEqual(calls[2].body, { uuid: "client-uuid", endTime: 2000 });
  assert.equal(calls[3].body, report);
  await sendReport(post, report, meta);
  assert.deepEqual(calls.slice(0, 4), calls.slice(4));
});

for (const stage of ["load", "start", "end"]) {
  test(`stops on a failed ${stage} without submitting a partial report`, async () => {
    const { post, calls } = recorder(`/collection/${stage}`);
    await assert.rejects(
      () => sendReport(post, report, meta),
      /Offline retry needed/,
    );
    assert.equal(calls.at(-1).path, `/collection/${stage}`);
    assert.ok(!calls.some(({ path }) => path === "/collection/submit"));
  });
}

test("keeps legacy offline reports on the original upload contract", async () => {
  const { post, calls } = recorder();
  await sendReport(post, report, { ...meta, collection: undefined });
  assert.deepEqual(calls, [{ path: "/collection/scoutreports", body: report }]);
});

test("requires a recorded end time before uploading a new report", async () => {
  const { post, calls } = recorder();
  await assert.rejects(
    () =>
      sendReport(post, report, {
        ...meta,
        collection: { sourceTeamNumber: 8033 },
      }),
    /End the match/,
  );
  assert.deepEqual(calls, []);
});

test("keeps training attempts bound to load requests", async () => {
  const { post, calls } = recorder();
  await sendReport(post, report, {
    ...meta,
    collection: {
      ...meta.collection,
      trainingAttemptUuid: "attempt",
    },
  });
  assert.equal(calls[0].body.trainingAttemptUuid, "attempt");
});

test("paired training uploads use their session endpoint", async () => {
  const { post, calls } = recorder();
  await sendReport(post, report, {
    ...meta,
    collection: {
      ...meta.collection,
      trainingAttemptUuid: "attempt",
      trainingSessionUuid: "session",
    },
  });
  assert.equal(calls.at(-1).path, "/collection/training/session/submit");
  assert.ok(!calls.some(({ path }) => path === "/collection/scoutreports"));
});

test("practice lifecycle requests retain their match type", async () => {
  const { post, calls } = recorder();
  await sendReportLifecycle(post, report.uuid, {
    ...meta,
    matchIdentity: { ...meta.matchIdentity, matchType: "PRACTICE" },
  });
  assert.equal(calls[0].body.matchIdentity.matchType, "PRACTICE");
});

import { expect, jest, test } from "@jest/globals";
import { sendReport, checkedPost } from "../../lib/lovatAPI/collectionRequests";
import { makeReport, meta } from "./fixtures";

test("offline retry replays original lifecycle and payload in order", async () => {
  const report = makeReport();
  const calls: { path: string; body: unknown }[] = [];
  const post = jest.fn(async (path: string, body: unknown) => {
    calls.push({ path, body });
    return new Response("{}");
  });
  const tracked = {
    ...meta,
    collection: { sourceTeamNumber: 4321, endTime: 5000 },
  };
  await sendReport(post, report, tracked);
  await sendReport(post, report, tracked);
  expect(calls.map((c) => c.path)).toEqual([
    "/collection/load",
    "/collection/start",
    "/collection/end",
    "/collection/submit",
    "/collection/load",
    "/collection/start",
    "/collection/end",
    "/collection/submit",
  ]);
  expect(calls[3].body).toBe(report);
  expect(calls[1].body).toEqual({ uuid: report.uuid, startTime: 1000 });
});
test("incomplete tracked report is rejected without any request", async () => {
  const post = jest.fn(async () => new Response("{}"));
  await expect(
    sendReport(post, makeReport(), {
      ...meta,
      collection: { sourceTeamNumber: 4321 },
    }),
  ).rejects.toThrow("End the match");
  expect(post).not.toHaveBeenCalled();
});
test("legacy payload retains its endpoint and non-JSON errors remain retryable", async () => {
  const post = jest.fn(
    async () => new Response("bad gateway", { status: 502 }),
  );
  await expect(sendReport(post, makeReport())).rejects.toThrow(
    "Could not save report. Try again.",
  );
  expect(post.mock.calls).toHaveLength(1);
});
test("JSON validation errors are shown and later lifecycle calls are not sent", async () => {
  const post = jest.fn(async () =>
    Response.json({ displayError: "Wrong match" }, { status: 400 }),
  );
  await expect(checkedPost(post, "/collection/load", {})).rejects.toThrow(
    "Wrong match",
  );
  expect(post).toHaveBeenCalledTimes(1);
});

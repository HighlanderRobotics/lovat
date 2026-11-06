import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMissingMatchResponse,
  isUnavailableScheduleError,
  parseAPIError,
} from "../lib/lovatAPI/apiError.ts";

for (const body of [
  "MATCH_NOT_FOUND",
  JSON.stringify({
    code: "MATCH_NOT_FOUND",
    message: "Match not found",
    displayError: "Match not found",
  }),
]) {
  test(`recognizes missing matches from ${body.startsWith("{") ? "JSON" : "legacy text"}`, () => {
    assert.equal(isMissingMatchResponse(404, body), true);
    assert.equal(isMissingMatchResponse(500, body), false);
  });
}
test("does not mistake an unknown route or server failure for a missing match", () => {
  assert.equal(isMissingMatchResponse(404, { code: "NOT_FOUND" }), false);
  assert.equal(
    isMissingMatchResponse(500, { code: "INTERNAL_SERVER_ERROR" }),
    false,
  );
});
for (const body of [
  {
    code: "MATCHES_NOT_AVAILABLE",
    displayError: "Matches are not available for this tournament",
  },
  { error: "Matches are not available for this tournamnet" },
  { message: "Matches are not available for this tournament" },
]) {
  test(`preserves the empty schedule result for ${JSON.stringify(body)}`, () => {
    assert.equal(isUnavailableScheduleError(body), true);
  });
}
test("does not hide schedule server failures as empty schedules", () => {
  assert.equal(
    isUnavailableScheduleError({
      code: "INTERNAL_SERVER_ERROR",
      displayError: "Internal server error",
    }),
    false,
  );
});
test("reads readable messages and tolerates invalid bodies", () => {
  assert.deepEqual(
    parseAPIError({
      code: "CONFLICT",
      message: "Retry",
      displayError: "Try again",
    }),
    { code: "CONFLICT", message: "Try again" },
  );
  assert.deepEqual(parseAPIError(null), {});
  assert.equal(
    parseAPIError("<html>Unavailable</html>").message,
    "<html>Unavailable</html>",
  );
});

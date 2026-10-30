import { describe, expect, it } from "vitest";

import {
  GitHubApi,
  GitHubApiError,
  parseNextLink,
} from "../src/github.js";
import { jsonResponse, noSleep, scriptedFetch, textResponse } from "./helpers.js";

function client(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof GitHubApi>[0]> = {},
): GitHubApi {
  return new GitHubApi({
    token: "github-token",
    repoFullName: "HighlanderRobotics/lovat",
    pullNumber: 42,
    fetchImpl,
    ...overrides,
  });
}

describe("GitHubApi", () => {
  it("maps pull request metadata", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse({
        number: 42,
        title: "Change",
        draft: false,
        state: "open",
        changed_files: 7,
        base: { sha: "base" },
        head: { sha: "head" },
      }),
    ]);

    const pull = await client(fetchImpl).getPullRequest();

    expect(pull).toEqual({
      number: 42,
      title: "Change",
      draft: false,
      state: "open",
      baseSha: "base",
      headSha: "head",
      changedFiles: 7,
    });
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/HighlanderRobotics/lovat/pulls/42",
    );
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer github-token",
    );
  });

  it("follows pagination links for changed files", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse(
        [
          {
            filename: "src/a.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
        {
          headers: {
            link: '<https://api.github.com/repos/HighlanderRobotics/lovat/pulls/42/files?page=2>; rel="next"',
          },
        },
      ),
      jsonResponse([
        {
          filename: "src/old.ts",
          previous_filename: "src/previous.ts",
          status: "renamed",
          additions: 0,
          deletions: 0,
          patch: "",
        },
      ]),
    ]);

    const files = await client(fetchImpl).listPullRequestFiles();

    expect(files).toEqual([
      {
        path: "src/a.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: "@@ -1 +1 @@\n-old\n+new",
      },
      {
        path: "src/old.ts",
        status: "renamed",
        additions: 0,
        deletions: 0,
        patch: "",
        previousPath: "src/previous.ts",
      },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toContain("page=2");
  });

  it("maps review comments and reviews", async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse([
        {
          id: 1,
          body: "finding",
          path: "src/a.ts",
          line: 12,
          user: { type: "Bot" },
        },
      ]),
      jsonResponse([{ id: 2, body: "summary", user: { type: "Bot" } }]),
    ]);

    const api = client(fetchImpl);
    await expect(api.listReviewComments()).resolves.toEqual([
      { id: 1, body: "finding", path: "src/a.ts", line: 12, userType: "Bot" },
    ]);
    await expect(api.listReviews()).resolves.toEqual([
      { id: 2, body: "summary", userType: "Bot" },
    ]);
  });

  it("reads base-revision files and handles missing paths", async () => {
    const content = Buffer.from("review guide", "utf8").toString("base64");
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse({ type: "file", encoding: "base64", content }),
      textResponse(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      jsonResponse({ type: "dir" }),
    ]);

    const api = client(fetchImpl);
    await expect(api.getFileAtRef("CODE_REVIEW.md", "base sha")).resolves.toBe(
      "review guide",
    );
    expect(calls[0]!.url).toContain("ref=base%20sha");
    await expect(api.getFileAtRef("missing.md", "base")).resolves.toBeNull();
    await expect(api.getFileAtRef("src", "base")).resolves.toBeNull();
  });

  it("publishes COMMENT reviews with inline positions", async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse({ id: 1 })]);

    await client(fetchImpl).createReview({
      body: "summary",
      comments: [
        { path: "src/a.ts", line: 12, side: "RIGHT", body: "inline" },
      ],
    });

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.event).toBe("COMMENT");
    expect(body.body).toBe("summary");
    expect(body.comments).toEqual([
      { path: "src/a.ts", line: 12, side: "RIGHT", body: "inline" },
    ]);
  });

  it("surfaces API errors with status information", async () => {
    const { fetchImpl } = scriptedFetch([
      textResponse(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
      }),
    ]);

    await expect(client(fetchImpl).getPullRequest()).rejects.toMatchObject({
      name: "GitHubApiError",
      status: 401,
    });
  });

  it("retries safe GET failures", async () => {
    const { sleep, delays } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("unavailable", { status: 503 }),
      jsonResponse([]),
    ]);

    await client(fetchImpl, { sleep }).listReviews();
    expect(calls).toHaveLength(2);
    expect(delays).toHaveLength(1);
  });

  it("does not retry an ambiguous POST failure", async () => {
    const { sleep } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("server error", { status: 500 }),
    ]);

    await expect(
      client(fetchImpl, { sleep }).createReview({ body: "x", comments: [] }),
    ).rejects.toBeInstanceOf(GitHubApiError);
    expect(calls).toHaveLength(1);
  });

  it("retries a rate-limited POST because it was not applied", async () => {
    const { sleep } = noSleep();
    const { fetchImpl, calls } = scriptedFetch([
      textResponse("rate limited", {
        status: 429,
        headers: { "retry-after": "1" },
      }),
      jsonResponse({ id: 1 }),
    ]);

    await client(fetchImpl, { sleep }).createReview({ body: "x", comments: [] });
    expect(calls).toHaveLength(2);
  });
});

describe("parseNextLink", () => {
  it("extracts the next link", () => {
    expect(
      parseNextLink(
        '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"',
      ),
    ).toBe("https://api.github.com/x?page=2");
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink("")).toBeNull();
    expect(parseNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
  });
});

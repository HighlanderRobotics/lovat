import { parseRetryAfter } from "./openrouter.js";
import type {
  CreateReviewInput,
  PullRequestFile,
  PullRequestInfo,
  ReviewCommentInfo,
  ReviewGitHub,
  ReviewInfo,
} from "./types.js";

export interface GitHubApiOptions {
  token: string;
  repoFullName: string;
  pullNumber: number;
  apiUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

interface GitHubRequestOptions {
  method?: string;
  body?: unknown;
  retry?: boolean;
}

interface RawUser {
  login?: string;
  type?: string;
}

interface RawPullRequest {
  number: number;
  title?: string;
  draft?: boolean;
  state?: string;
  changed_files?: number;
  base?: { sha?: string };
  head?: { sha?: string };
}

interface RawPullRequestFile {
  filename: string;
  previous_filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

interface RawReviewComment {
  id: number;
  body?: string;
  path?: string;
  line?: number | null;
  user?: RawUser;
}

interface RawReview {
  id: number;
  body?: string;
  user?: RawUser;
}

interface RawContentFile {
  type?: string;
  encoding?: string;
  content?: string;
}

export class GitHubApi implements ReviewGitHub {
  private readonly apiUrl: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: GitHubApiOptions) {
    const [owner, repo, ...rest] = options.repoFullName.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error(
        `GITHUB_REPOSITORY must be owner/repo, received: ${options.repoFullName}`,
      );
    }

    this.owner = owner;
    this.repo = repo;
    this.apiUrl = (options.apiUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async getPullRequest(): Promise<PullRequestInfo> {
    const value = await this.requestJson<RawPullRequest>(
      this.repoPath(`/pulls/${this.options.pullNumber}`),
      { method: "GET", retry: true },
    );

    if (!value) throw new Error("GitHub returned an empty pull request.");

    return {
      number: value.number,
      title: value.title ?? "",
      draft: value.draft === true,
      state: value.state ?? "unknown",
      baseSha: value.base?.sha ?? "",
      headSha: value.head?.sha ?? "",
      changedFiles: value.changed_files ?? 0,
    };
  }

  async listPullRequestFiles(): Promise<PullRequestFile[]> {
    const files = await this.listPaginated<RawPullRequestFile>(
      this.repoPath(`/pulls/${this.options.pullNumber}/files`),
    );

    return files.map((file) => ({
      path: file.filename,
      status: file.status ?? "modified",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      ...(file.patch === undefined ? {} : { patch: file.patch }),
      ...(file.previous_filename === undefined
        ? {}
        : { previousPath: file.previous_filename }),
    }));
  }

  async listReviewComments(): Promise<ReviewCommentInfo[]> {
    const comments = await this.listPaginated<RawReviewComment>(
      this.repoPath(`/pulls/${this.options.pullNumber}/comments`),
    );

    return comments.map((comment) => ({
      id: comment.id,
      body: comment.body ?? "",
      path: comment.path ?? "",
      line: comment.line ?? null,
      userType: comment.user?.type ?? "Unknown",
    }));
  }

  async listReviews(): Promise<ReviewInfo[]> {
    const reviews = await this.listPaginated<RawReview>(
      this.repoPath(`/pulls/${this.options.pullNumber}/reviews`),
    );

    return reviews.map((review) => ({
      id: review.id,
      body: review.body ?? "",
      userType: review.user?.type ?? "Unknown",
    }));
  }

  async getFileAtRef(path: string, ref: string): Promise<string | null> {
    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    let value: RawContentFile | null;
    try {
      value = await this.requestJson<RawContentFile>(
        this.repoPath(`/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`),
        { method: "GET", retry: true },
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }

    if (
      !value ||
      value.type !== "file" ||
      value.encoding !== "base64" ||
      typeof value.content !== "string"
    ) {
      return null;
    }

    return Buffer.from(value.content.replace(/\s/g, ""), "base64").toString(
      "utf8",
    );
  }

  async createReview(input: CreateReviewInput): Promise<void> {
    await this.requestJson(
      this.repoPath(`/pulls/${this.options.pullNumber}/reviews`),
      {
        method: "POST",
        retry: false,
        body: {
          body: input.body,
          event: "COMMENT",
          comments: input.comments.map((comment) => ({
            path: comment.path,
            line: comment.line,
            side: comment.side,
            body: comment.body,
          })),
        },
      },
    );
  }

  private repoPath(suffix: string): string {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${suffix}`;
  }

  private async listPaginated<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = path;
    let pages = 0;

    while (next !== null && pages < 50) {
      const result = await this.request<T[]>(next, {
        method: "GET",
        retry: true,
      });
      items.push(...result.data);
      next = parseNextLink(result.headers.get("link"));
      pages += 1;
    }

    return items;
  }

  private async requestJson<T>(
    path: string,
    options: GitHubRequestOptions,
  ): Promise<T | null> {
    const result = await this.request<T>(path, options);
    return result.data;
  }

  private async request<T>(
    path: string,
    options: GitHubRequestOptions,
  ): Promise<{ data: T; headers: Headers }> {
    const method = options.method ?? "GET";
    const url = path.startsWith("http") ? path : `${this.apiUrl}${path}`;
    let attempt = 0;

    while (true) {
      attempt += 1;

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${this.options.token}`,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const safeMethod = options.retry === true;
        if (safeMethod && attempt <= this.maxRetries) {
          await this.sleep(this.retryDelay(attempt - 1));
          continue;
        }
        throw new GitHubApiError(
          `GitHub request failed before a response was received: ${describeError(error)}`,
          0,
          safeMethod,
        );
      }

      const text = await response.text();

      if (response.ok) {
        const data =
          text.trim().length === 0 ? (null as T) : (JSON.parse(text) as T);
        return { data, headers: response.headers };
      }

      const message = extractGitHubError(text, response.status);
      const rateLimited =
        response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0";
      const retryable =
        rateLimited ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      // GET requests and rate-limit rejections are safe to retry. A POST that
      // may already have been applied is not, because a retry could duplicate
      // a review comment.
      const safeToRetry = options.retry === true || rateLimited || response.status === 429;

      if (retryable && safeToRetry && attempt <= this.maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const resetDelay =
          Number.isFinite(reset) && reset > 0
            ? Math.max(0, reset * 1_000 - this.now())
            : undefined;
        const delay = Math.min(
          60_000,
          retryAfter ?? (resetDelay === undefined ? this.retryDelay(attempt - 1) : resetDelay),
        );
        await this.sleep(Math.max(1_000, delay));
        continue;
      }

      throw new GitHubApiError(
        `GitHub API returned ${response.status}: ${message}`,
        response.status,
        retryable,
      );
    }
  }

  private retryDelay(attempt: number): number {
    return Math.min(30_000, 1_000 * 2 ** attempt);
  }
}

export function parseNextLink(linkHeader: string | null): string | null {
  if (linkHeader === null || linkHeader.trim() === "") return null;

  for (const part of linkHeader.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part.trim());
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractGitHubError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { message?: string; documentation_url?: string };
    return parsed.message ?? `HTTP ${status}`;
  } catch {
    return text.trim().slice(0, 300) || `HTTP ${status}`;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown network error";
}

import type {
  CreateReviewInput,
  ModelReviewRequest,
  ModelReviewResult,
  ModelUsage,
  PullRequestFile,
  PullRequestInfo,
  ReviewerModel,
  ReviewCommentInfo,
  ReviewGitHub,
  ReviewInfo,
  SummaryCommentInfo,
} from "../src/types.js";
import type { DiffLineMap } from "../src/types.js";

export const samplePullRequest: PullRequestInfo = {
  number: 42,
  title: "Add report authorization",
  draft: false,
  state: "open",
  baseSha: "base-sha",
  headSha: "head-sha",
  changedFiles: 1,
};

export const samplePatch = [
  "@@ -10,6 +10,8 @@ export async function handler(req, res) {",
  "   const id = req.params.id;",
  "   const report = await prisma.report.findUnique({ where: { id } });",
  "-  res.json(report);",
  "+  if (!report) return res.status(404).json({ error: 'not found' });",
  "+  res.json(report);",
  " }",
].join("\n");

export function file(
  path: string,
  patch: string | null = samplePatch,
  overrides: Partial<PullRequestFile> = {},
): PullRequestFile {
  return {
    path,
    status: "modified",
    additions: 2,
    deletions: 1,
    ...(patch === null ? {} : { patch }),
    ...overrides,
  };
}

export function lineMap(added: number[], removed: number[]): DiffLineMap {
  return {
    added: new Set(added),
    removed: new Set(removed),
  };
}

export function modelResponse(
  findings: unknown[],
  assessment = "The change is sound overall.",
): string {
  return JSON.stringify({ assessment, findings });
}

export function rawFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severity: "HIGH",
    category: "BUG",
    title: "Missing null check",
    description:
      "The report can be null when the id is unknown, and the response is serialized without checking.",
    suggestion: "Return a 404 when the report is missing.",
    file: "src/report.ts",
    line: 12,
    confidence: 0.9,
    ...overrides,
  };
}

export function modelResult(
  content: string,
  overrides: Partial<ModelReviewResult> = {},
): ModelReviewResult {
  const usage: ModelUsage = {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  };

  return {
    content,
    usage,
    usedJsonSchema: true,
    durationMs: 5,
    ...overrides,
  };
}

export class FakeModel implements ReviewerModel {
  readonly calls: ModelReviewRequest[] = [];

  constructor(
    private readonly handler:
      | ((request: ModelReviewRequest, index: number) => ModelReviewResult | Promise<ModelReviewResult>)
      | string[]
      | string,
  ) {}

  async review(request: ModelReviewRequest): Promise<ModelReviewResult> {
    const index = this.calls.length;
    this.calls.push(request);

    if (typeof this.handler === "string") {
      return modelResult(this.handler);
    }

    if (Array.isArray(this.handler)) {
      const content = this.handler[index];
      if (content === undefined) {
        throw new Error(`FakeModel has no response for call ${index + 1}`);
      }
      return modelResult(content);
    }

    return this.handler(request, index);
  }
}

export class FakeGitHub implements ReviewGitHub {
  pullRequest: PullRequestInfo;
  files: PullRequestFile[];
  reviews: ReviewInfo[] = [];
  comments: ReviewCommentInfo[] = [];
  contents = new Map<string, string>();
  createdReviews: CreateReviewInput[] = [];
  createReviewFailures: Error[] = [];
  summaryComments: SummaryCommentInfo[] = [];
  createdSummaryComments: string[] = [];
  updatedSummaryComments: string[] = [];
  minimizedReviews: string[] = [];
  minimizeFailure?: Error;
  summaryFailure?: Error;
  private nextId = 1;

  constructor(options: {
    pullRequest?: Partial<PullRequestInfo>;
    files?: PullRequestFile[];
    contents?: Record<string, string>;
  } = {}) {
    this.pullRequest = { ...samplePullRequest, ...options.pullRequest };
    this.files = options.files ?? [file("src/report.ts")];
    this.contents = new Map(Object.entries(options.contents ?? {}));
  }

  async getPullRequest(): Promise<PullRequestInfo> {
    return this.pullRequest;
  }

  async listPullRequestFiles(): Promise<PullRequestFile[]> {
    return this.files;
  }

  async listReviewComments(): Promise<ReviewCommentInfo[]> {
    return this.comments;
  }

  async listReviews(): Promise<ReviewInfo[]> {
    return [...this.reviews];
  }

  async getFileAtRef(path: string, _ref: string): Promise<string | null> {
    return this.contents.get(path) ?? null;
  }

  async listSummaryComments(): Promise<SummaryCommentInfo[]> {
    return this.summaryComments;
  }

  async createSummaryComment(body: string): Promise<void> {
    if (this.summaryFailure) throw this.summaryFailure;
    this.createdSummaryComments.push(body);
    this.summaryComments.push({ id: this.nextId++, body, userType: "Bot", userLogin: "github-actions[bot]" });
  }

  async updateSummaryComment(id: number, body: string): Promise<void> {
    if (this.summaryFailure) throw this.summaryFailure;
    const comment = this.summaryComments.find((comment) => comment.id === id);
    if (!comment) throw new Error("Unknown summary comment");
    comment.body = body;
    this.updatedSummaryComments.push(body);
  }

  async minimizeReview(nodeId: string): Promise<void> {
    if (this.minimizeFailure) throw this.minimizeFailure;
    this.minimizedReviews.push(nodeId);
  }

  async createReview(input: CreateReviewInput): Promise<ReviewInfo> {
    const failure = this.createReviewFailures.shift();
    if (failure) throw failure;

    this.createdReviews.push(input);
    const review = {
      id: this.nextId++,
      nodeId: `review-${this.nextId}`,
      body: input.body,
      userType: "Bot",
      userLogin: "github-actions[bot]",
    };
    this.reviews.push(review);
    return review;
  }
}

export interface FetchCall {
  url: string;
  init: RequestInit;
}

export function scriptedFetch(
  handlers: Array<
    | Response
    | ((url: string, init: RequestInit) => Response | Promise<Response>)
  >,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let index = 0;

  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    const handler = handlers[index];
    index += 1;

    if (handler === undefined) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`);
    }

    if (handler instanceof Response) return handler;
    return handler(url, requestInit);
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function textResponse(
  body: string,
  init: ResponseInit = {},
): Response {
  return new Response(body, init);
}

export function noSleep(): {
  sleep: (milliseconds: number) => Promise<void>;
  delays: number[];
} {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (milliseconds: number) => {
      delays.push(milliseconds);
    },
  };
}

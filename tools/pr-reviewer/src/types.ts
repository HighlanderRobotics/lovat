export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  "BUG",
  "SECURITY",
  "PERFORMANCE",
  "DATABASE",
  "TYPE_SAFETY",
  "ARCHITECTURE",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface FindingPosition {
  side: "RIGHT" | "LEFT";
  line: number;
}

export interface ReviewFinding {
  /** Stable fingerprint-derived identifier for this finding. */
  id: string;
  fingerprint: string;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  suggestion: string;
  file: string;
  line: number;
  confidence: number;
  /** Null when the finding does not land on a changed line. */
  position: FindingPosition | null;
}

/** A raw finding parsed from a model response, before normalization. */
export interface ModelFinding {
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  suggestion: string;
  file: string;
  line: number;
  confidence: number;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface ModelReviewResult {
  content: string;
  usage: ModelUsage;
  finishReason?: string;
  usedJsonSchema: boolean;
  durationMs: number;
}

export interface ModelReviewRequest {
  systemPrompt: string;
  userPrompt: string;
  batchIndex: number;
  batchCount: number;
}

export interface ReviewerModel {
  review(request: ModelReviewRequest): Promise<ModelReviewResult>;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  draft: boolean;
  state: string;
  baseSha: string;
  headSha: string;
  changedFiles: number;
}

export interface PullRequestFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previousPath?: string;
}

export interface ReviewCommentInfo {
  id: number;
  body: string;
  path: string;
  line: number | null;
  userType: string;
}

export interface ReviewInfo {
  id: number;
  body: string;
  userType: string;
}

export interface InlineReviewComment {
  path: string;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
}

export interface CreateReviewInput {
  body: string;
  comments: InlineReviewComment[];
}

/**
 * The GitHub surface the reviewer needs. Keeping this narrow makes the review
 * lifecycle testable without a live GitHub API.
 */
export interface ReviewGitHub {
  getPullRequest(): Promise<PullRequestInfo>;
  listPullRequestFiles(): Promise<PullRequestFile[]>;
  listReviewComments(): Promise<ReviewCommentInfo[]>;
  listReviews(): Promise<ReviewInfo[]>;
  getFileAtRef(path: string, ref: string): Promise<string | null>;
  createReview(input: CreateReviewInput): Promise<void>;
}

export interface DiffLineMap {
  /** New-file line numbers for added lines. */
  added: Set<number>;
  /** Old-file line numbers for removed lines. */
  removed: Set<number>;
}

export interface DiffSegment {
  path: string;
  status: string;
  patch: string;
  part: number;
  parts: number;
  map: DiffLineMap;
}

export interface DiffBatch {
  segments: DiffSegment[];
  characters: number;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

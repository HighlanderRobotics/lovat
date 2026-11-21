import { createHash } from "node:crypto";

import { SEVERITIES, SEVERITY_RANK } from "./types.js";
import type {
  Category,
  ModelFinding,
  ReviewFinding,
  Severity,
} from "./types.js";
import { buildFileIndex, type FileIndexEntry } from "./diff.js";
import type { PullRequestFile } from "./types.js";
import { redactSecrets, truncate } from "./redact.js";

export interface FindingPreparationContext {
  repoFullName: string;
  pullNumber: number;
  files: readonly PullRequestFile[];
  categories: readonly Category[];
  minimumConfidence: number;
  maxFindings: number;
  knownSecrets?: readonly string[];
}

export interface FindingPreparationStats {
  filteredByCategory: number;
  filteredByConfidence: number;
  unknownFile: number;
  duplicated: number;
  capped: number;
}

export interface PreparedFindings {
  findings: ReviewFinding[];
  stats: FindingPreparationStats;
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A fingerprint is stable across reviews of the same pull request. It excludes
 * descriptions and suggestions on purpose: the model can phrase those
 * differently on a later run without creating a duplicate comment.
 */
export function fingerprintFinding(input: {
  repoFullName: string;
  pullNumber: number;
  file: string;
  category: Category;
  title: string;
}): string {
  const material = [
    input.repoFullName.toLowerCase(),
    String(input.pullNumber),
    input.file.replaceAll("\\", "/"),
    input.category,
    normalizeTitle(input.title),
  ].join("\n");

  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function normalizeFilePath(
  rawPath: string,
  index: Map<string, FileIndexEntry>,
): string | null {
  let candidate = rawPath.trim().replaceAll("\\", "/").replace(/^\.\//, "");

  if (candidate.startsWith("a/") || candidate.startsWith("b/")) {
    const withoutPrefix = candidate.slice(2);
    if (index.has(withoutPrefix)) candidate = withoutPrefix;
  }

  if (index.has(candidate)) return candidate;

  for (const entry of index.values()) {
    if (entry.previousPath === candidate) return entry.path;
  }

  if (!candidate.includes("/")) {
    const suffixMatches = [...index.keys()].filter((path) =>
      path.endsWith(`/${candidate}`),
    );
    if (suffixMatches.length === 1) return suffixMatches[0]!;
  }

  return null;
}

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

/**
 * Normalize, filter, deduplicate, and cap model findings. Findings that are
 * real but do not land on a changed line are retained with `position: null` so
 * they can still appear in the review summary.
 */
export function prepareFindings(
  rawFindings: readonly ModelFinding[],
  context: FindingPreparationContext,
): PreparedFindings {
  const index = buildFileIndex(context.files);
  const knownSecrets = context.knownSecrets ?? [];
  const allowedCategories = new Set(context.categories);
  const byFingerprint = new Map<string, ReviewFinding>();
  const stats: FindingPreparationStats = {
    filteredByCategory: 0,
    filteredByConfidence: 0,
    unknownFile: 0,
    duplicated: 0,
    capped: 0,
  };

  for (const raw of rawFindings) {
    const file = normalizeFilePath(raw.file, index);

    if (file === null) {
      stats.unknownFile += 1;
      continue;
    }

    if (!allowedCategories.has(raw.category)) {
      stats.filteredByCategory += 1;
      continue;
    }

    if (
      !Number.isFinite(raw.confidence) ||
      raw.confidence < context.minimumConfidence
    ) {
      stats.filteredByConfidence += 1;
      continue;
    }

    const title = redactSecrets(raw.title.trim(), knownSecrets);
    const fingerprint = fingerprintFinding({
      repoFullName: context.repoFullName,
      pullNumber: context.pullNumber,
      file,
      category: raw.category,
      title,
    });

    const entry = index.get(file)!;
    const position =
      raw.line > 0 && entry.map.added.has(raw.line)
        ? { side: "RIGHT" as const, line: raw.line }
        : raw.line > 0 && entry.map.removed.has(raw.line)
          ? { side: "LEFT" as const, line: raw.line }
          : null;

    const finding: ReviewFinding = {
      id: fingerprint,
      fingerprint,
      severity: raw.severity,
      category: raw.category,
      title: truncate(title, 200),
      description: truncate(
        redactSecrets(raw.description.trim(), knownSecrets),
        4_000,
      ),
      suggestion: truncate(
        redactSecrets(raw.suggestion.trim(), knownSecrets),
        4_000,
      ),
      file,
      line: raw.line,
      confidence: raw.confidence,
      position,
    };

    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      stats.duplicated += 1;
      if (finding.confidence > existing.confidence) {
        byFingerprint.set(fingerprint, finding);
      }
      continue;
    }

    byFingerprint.set(fingerprint, finding);
  }

  const sorted = [...byFingerprint.values()].sort((left, right) => {
    const severityDifference =
      severityRank(left.severity) - severityRank(right.severity);
    if (severityDifference !== 0) return severityDifference;
    return right.confidence - left.confidence;
  });

  if (sorted.length > context.maxFindings) {
    stats.capped = sorted.length - context.maxFindings;
  }

  return {
    findings: sorted.slice(0, context.maxFindings),
    stats,
  };
}

export function findingMarker(fingerprint: string): string {
  return `<!-- lovat-review:finding ${fingerprint} -->`;
}

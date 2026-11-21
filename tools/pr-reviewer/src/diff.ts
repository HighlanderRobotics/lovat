import { isExcludedPath } from "./glob.js";
import type {
  DiffBatch,
  DiffLineMap,
  DiffSegment,
  PullRequestFile,
} from "./types.js";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse the added and removed line numbers out of a unified diff patch.
 * Line numbers for added lines are new-file lines and lines for removed lines
 * are old-file lines, which is the coordinate system GitHub review comments use.
 */
export function parsePatchLineMap(patch: string): DiffLineMap {
  const added = new Set<number>();
  const removed = new Set<number>();

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const match = HUNK_HEADER.exec(line);

    if (match) {
      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+")) {
      added.add(newLine);
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      removed.add(oldLine);
      oldLine += 1;
      continue;
    }

    if (line.startsWith("\\")) {
      // "\ No newline at end of file" does not consume a line.
      continue;
    }

    // Context lines start with a space. Some tooling strips that trailing
    // space, so an empty line is also treated as context.
    if (line.length === 0 || line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { added, removed };
}

export interface FileSelection {
  reviewable: PullRequestFile[];
  excluded: string[];
  missingPatch: string[];
}

export function selectReviewableFiles(
  files: readonly PullRequestFile[],
  excludedPaths: readonly string[],
): FileSelection {
  const reviewable: PullRequestFile[] = [];
  const excluded: string[] = [];
  const missingPatch: string[] = [];

  for (const file of files) {
    const excludedByPath =
      isExcludedPath(file.path, excludedPaths) ||
      (file.previousPath !== undefined &&
        isExcludedPath(file.previousPath, excludedPaths));

    if (excludedByPath) {
      excluded.push(file.path);
      continue;
    }

    if (file.patch === undefined || file.patch.trim().length === 0) {
      missingPatch.push(file.path);
      continue;
    }

    reviewable.push(file);
  }

  return { reviewable, excluded, missingPatch };
}

/**
 * Split a patch at hunk boundaries so a large file is never silently dropped.
 * Splitting is only a transport concern: line mapping always uses the complete
 * original patch.
 */
export function splitPatch(patch: string, maxCharacters: number): string[] {
  if (patch.length <= maxCharacters) return [patch];

  const lines = patch.split("\n");
  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));

  if (firstHunkIndex === -1) {
    return [patch];
  }

  const header = lines.slice(0, firstHunkIndex);
  const hunks: string[][] = [];

  for (const line of lines.slice(firstHunkIndex)) {
    if (line.startsWith("@@")) {
      hunks.push([line]);
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1]!.push(line);
    }
  }

  const headerText = header.join("\n");
  const chunks: string[] = [];
  const headerBudget = maxCharacters - headerText.length - 2;
  const hunkBudget = Math.max(200, headerBudget);

  for (const hunk of hunks) {
    const text = [headerText, ...hunk].filter(Boolean).join("\n");

    if (text.length <= maxCharacters) {
      chunks.push(text);
      continue;
    }

    for (const part of splitHunk(hunk, hunkBudget)) {
      chunks.push([headerText, ...part].filter(Boolean).join("\n"));
    }
  }

  return chunks;
}

function splitHunk(hunk: readonly string[], budget: number): string[][] {
  const [header, ...body] = hunk;
  if (header === undefined) return [];

  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length > 0) {
      groups.push([header, ...current]);
      current = [];
      currentLength = 0;
    }
  };

  for (const line of body) {
    const lineLength = line.length + 1;

    if (lineLength > budget) {
      // A single very long line is kept intact rather than split, because
      // splitting would corrupt the diff marker and line meaning. Batches are
      // allowed to exceed their soft budget by one line.
      flush();
      groups.push([header, line]);
      continue;
    }

    if (current.length > 0 && currentLength + lineLength > budget) {
      flush();
    }

    current.push(line);
    currentLength += lineLength;
  }

  flush();

  if (groups.length === 0) {
    groups.push([header]);
  }

  return groups;
}

/**
 * Pack diff segments into request-sized batches. Every reviewable line ends up
 * in exactly one batch; the only content omitted is what the configuration
 * excludes or what GitHub did not return a patch for.
 */
export function planBatches(
  files: readonly PullRequestFile[],
  maxCharacters: number,
): DiffBatch[] {
  const budget = Math.max(1_000, maxCharacters);
  const segments: DiffSegment[] = [];

  for (const file of files) {
    if (file.patch === undefined) continue;

    const parts = splitPatch(file.patch, Math.max(1_000, budget - 200));

    parts.forEach((patch, index) => {
      segments.push({
        path: file.path,
        status: file.status,
        patch,
        part: index + 1,
        parts: parts.length,
        // Parse the segment itself so the prompt only advertises changed lines
        // that are actually present in this request.
        map: parsePatchLineMap(patch),
      });
    });
  }

  const batches: DiffBatch[] = [];
  let current: DiffSegment[] = [];
  let characters = 0;

  const flush = () => {
    if (current.length > 0) {
      batches.push({ segments: current, characters });
      current = [];
      characters = 0;
    }
  };

  for (const segment of segments) {
    const size = segment.patch.length + segment.path.length + 120;

    if (current.length > 0 && characters + size > budget) {
      flush();
    }

    current.push(segment);
    characters += size;
  }

  flush();

  return batches;
}

export interface FileIndexEntry {
  path: string;
  previousPath?: string;
  map: DiffLineMap;
}

export function buildFileIndex(
  files: readonly PullRequestFile[],
): Map<string, FileIndexEntry> {
  const index = new Map<string, FileIndexEntry>();

  for (const file of files) {
    if (file.patch === undefined) continue;
    index.set(file.path, {
      path: file.path,
      ...(file.previousPath === undefined
        ? {}
        : { previousPath: file.previousPath }),
      map: parsePatchLineMap(file.patch),
    });
  }

  return index;
}

import { z } from "zod";

import { CATEGORIES, SEVERITIES } from "./types.js";
import type { ModelFinding } from "./types.js";
import { truncate } from "./redact.js";

export const reviewResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assessment", "findings"],
  properties: {
    assessment: {
      type: "string",
      description:
        "Two to four sentences summarizing the overall risk and whether the change is sound.",
    },
    findings: {
      type: "array",
      description: "Only concrete, actionable defects introduced by this diff.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "severity",
          "category",
          "title",
          "description",
          "suggestion",
          "file",
          "line",
          "confidence",
        ],
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          category: { type: "string", enum: [...CATEGORIES] },
          title: {
            type: "string",
            description: "Short, specific description of the defect.",
          },
          description: {
            type: "string",
            description:
              "Why this is a defect, including the concrete failure mode and evidence from the diff.",
          },
          suggestion: {
            type: "string",
            description: "The smallest reasonable correction.",
          },
          file: {
            type: "string",
            description: "Repository-relative path exactly as shown in the diff.",
          },
          line: {
            type: "integer",
            description:
              "A changed line number: new-file line for added/context lines, old-file line for removed lines.",
          },
          confidence: {
            type: "number",
            description: "Confidence from 0 to 1 that this is a real defect.",
          },
        },
      },
    },
  },
} as const;

const ModelFindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(4_000),
  suggestion: z.string().min(3).max(4_000),
  file: z.string().min(1).max(1_000),
  line: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
});

const EnvelopeSchema = z.object({
  assessment: z.string().max(4_000).optional(),
  findings: z.array(z.unknown()),
});

export class ModelResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelResponseError";
  }
}

export interface ParsedModelResponse {
  assessment: string;
  findings: ModelFinding[];
  invalidFindings: number;
}

/**
 * Extract a JSON object from a model response. Models occasionally wrap JSON
 * in a fenced block or add a sentence around it; both are recoverable without
 * relaxing validation of the payload itself.
 */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (trimmed.length === 0) {
    throw new ModelResponseError("The model returned an empty response.");
  }

  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new ModelResponseError(
      "The model response did not contain a JSON object.",
    );
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    throw new ModelResponseError("The model response contained invalid JSON.");
  }
}

function coerceFinding(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const severity =
    typeof record.severity === "string"
      ? record.severity.trim().toUpperCase()
      : record.severity;
  const category =
    typeof record.category === "string"
      ? record.category.trim().toUpperCase()
      : record.category;
  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : record.confidence;
  const line =
    typeof record.line === "number" && Number.isFinite(record.line)
      ? Math.trunc(record.line)
      : record.line;

  return {
    ...record,
    severity,
    category,
    confidence,
    line,
    title: trimIfString(record.title),
    description: trimIfString(record.description),
    suggestion: trimIfString(record.suggestion),
    file: trimIfString(record.file),
  };
}

function trimIfString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export function parseModelResponse(content: string): ParsedModelResponse {
  const parsed = extractJsonObject(content);
  const envelope = EnvelopeSchema.safeParse(parsed);

  if (!envelope.success) {
    throw new ModelResponseError(
      "The model response did not match the expected review structure.",
    );
  }

  const findings: ModelFinding[] = [];
  let invalidFindings = 0;

  for (const raw of envelope.data.findings) {
    const result = ModelFindingSchema.safeParse(coerceFinding(raw));

    if (result.success) {
      findings.push(result.data);
    } else {
      invalidFindings += 1;
    }
  }

  if (findings.length === 0 && envelope.data.findings.length > 0) {
    throw new ModelResponseError(
      "The model returned findings that did not match the required schema.",
    );
  }

  return {
    assessment: truncate(envelope.data.assessment?.trim() ?? "", 4_000),
    findings,
    invalidFindings,
  };
}

import type { ChangeContext, ModelReviewRequest } from "@adversarylabs/sdk";
import modelSchema from "../schemas/typescript-review.model.v1.schema.json" with { type: "json" };
import { TYPESCRIPT_REVIEW_PROMPT } from "./prompt.js";
import type { DeterministicSignal, Discovery } from "./types.js";

export function buildTypeScriptModelRequest(
  change: ChangeContext | null,
  discovery: Discovery,
  signals: DeterministicSignal[],
): ModelReviewRequest {
  return {
    prompt: TYPESCRIPT_REVIEW_PROMPT,
    input: {
      reviewScope: {
        scanMode: change?.scanMode ?? "all",
        changedFiles: [...(change?.changedFiles ?? [])].slice(0, 100),
        ...(change?.baseRef === undefined ? {} : { baseRef: change.baseRef }),
        ...(change?.headRef === undefined ? {} : { headRef: change.headRef }),
        worktree: change?.worktree ?? false,
      },
      preparation: {
        candidates: discovery.candidates,
        included: discovery.sources.length,
        omitted: discovery.omitted,
        totalCharacters: discovery.totalCharacters,
      },
      deterministicSignals: signals.slice(0, 80),
      sources: discovery.sources.map(({ id, path, status, content, truncated }) => ({
        id, path, status, content, truncated,
      })),
    },
    schema: modelSchema as Record<string, unknown>,
    budget: {
      maximumOutputTokens: 6_000,
      timeoutMs: 120_000,
    },
  };
}

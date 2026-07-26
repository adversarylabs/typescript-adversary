import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ModelReviewRequest, ReviewModel } from "@adversarylabs/sdk";
import { ModelReviewError } from "@adversarylabs/sdk";
import { createApp } from "../src/index.ts";

test("model observations that recommend no action do not become findings", async () => {
  const root = await mkdtemp(join(tmpdir(), "typescript-actionability-"));
  await writeFile(join(root, "index.ts"), "export const ready = true;\n");
  const model: ReviewModel = {
    async review<T>(_request: ModelReviewRequest) {
      return {
        output: {
          schemaVersion: 1,
          assessment: {
            verdict: "ready-with-minor-improvements",
            risk: "low",
            ship: true,
            summary: "The implementation is ready and has no material TypeScript concern.",
            primaryConcern: "",
          },
          observations: [{
            id: "acceptable-choice",
            title: "Acceptable explicit annotation",
            category: "type-system",
            severity: "low",
            confidence: "high",
            principle: "Annotations should communicate useful constraints.",
            summary: "The explicit boolean is redundant but harmless.",
            impact: "There is no meaningful engineering impact.",
            recommendation: "No action needed; keep this as-is.",
            tradeoffs: "Changing it would be optional ceremony.",
            evidence: [{
              evidenceId: "source:1",
              line: 1,
              detail: "The declaration is explicit.",
              quote: "export const ready = true;",
            }],
          }],
          strengths: [],
        } as T,
        provider: "fixture",
        model: "fixture",
      };
    },
  };

  const result = await createApp().run({
    input: { source: { path: root } },
    model,
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.opinion?.ship, true);
});

test("placeholder model judgments are rejected instead of presented", async () => {
  const root = await mkdtemp(join(tmpdir(), "typescript-placeholder-"));
  await writeFile(join(root, "index.ts"), "export const ready = true;\n");
  let calls = 0;
  const model: ReviewModel = {
    async review<T>() {
      calls += 1;
      return {
        output: {
          schemaVersion: 1,
          assessment: {
            verdict: "ready-with-minor-improvements",
            risk: "low",
            ship: true,
            summary: "summary",
            primaryConcern: "",
          },
          observations: [],
          strengths: [],
        } as T,
        provider: "fixture",
        model: "fixture",
      };
    },
  };

  await assert.rejects(
    createApp().run({ input: { source: { path: root } }, model }),
    (error: unknown) =>
      error instanceof ModelReviewError && error.code === "invalid_model_judgment",
  );
  assert.equal(calls, 2);
});

test("a placeholder first judgment gets one bounded repair attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "typescript-repair-"));
  await writeFile(join(root, "index.ts"), "export const ready = true;\n");
  let calls = 0;
  const model: ReviewModel = {
    async review<T>(request: ModelReviewRequest) {
      calls += 1;
      if (calls === 2) assert.match(request.prompt, /REPAIR REQUIREMENT/);
      return {
        output: {
          schemaVersion: 1,
          assessment: {
            verdict: "excellent-typescript",
            risk: "none",
            ship: true,
            summary: calls === 1
              ? "summary"
              : "The implementation exposes one small, coherent TypeScript declaration.",
            primaryConcern: "",
          },
          observations: [],
          strengths: [],
        } as T,
        provider: "fixture",
        model: "fixture",
      };
    },
  };

  const result = await createApp().run({
    input: { source: { path: root } },
    model,
  });

  assert.equal(calls, 2);
  assert.equal(result.opinion?.ship, true);
});

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ModelReviewRequest, ReviewModel } from "@adversarylabs/sdk";
import { createApp } from "../src/index.ts";
import type { TypeScriptModelOutput } from "../src/types.ts";

test("root TypeScript files and project metadata reach the bounded model input", async () => {
  const root = await mkdtemp(join(tmpdir(), "typescript-discovery-"));
  await writeFile(join(root, "index.ts"), "export const ready = true;\n");
  await writeFile(join(root, "package.json"), '{"type":"module"}\n');
  await writeFile(join(root, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext"}}\n');
  const output: TypeScriptModelOutput = {
    schemaVersion: 1,
    assessment: {
      verdict: "excellent-typescript",
      risk: "none",
      ship: true,
      summary: "The small module is coherent and exposes a clear TypeScript contract.",
      primaryConcern: "",
    },
    observations: [],
    strengths: [],
  };
  let paths: string[] = [];
  const model: ReviewModel = {
    async review<T>(request: ModelReviewRequest) {
      paths = (request.input as { sources: Array<{ path: string }> }).sources
        .map((source) => source.path);
      return { output: output as T, provider: "fixture", model: "fixture" };
    },
  };

  await createApp().run({ input: { source: { path: root } }, model });

  assert.deepEqual(paths.sort(), ["index.ts", "package.json", "tsconfig.json"]);
});

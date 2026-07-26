import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import type { ModelReviewRequest, ReviewModel } from "@adversarylabs/sdk";
import type { TypeScriptModelOutput } from "../src/types.ts";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("bundled runtime executes without node_modules", async () => {
  const artifact = await mkdtemp(join(tmpdir(), "typescript-artifact-"));
  const target = await mkdtemp(join(tmpdir(), "typescript-target-"));
  const entrypoint = join(artifact, "dist", "index.js");
  await mkdir(dirname(entrypoint), { recursive: true });
  await copyFile(join(projectRoot, "dist", "index.js"), entrypoint);
  await writeFile(join(artifact, "package.json"), '{"type":"module"}\n');
  await writeFile(join(target, "index.ts"), "export const ready = true;\n");
  const bundle = await readFile(entrypoint, "utf8");
  assert.doesNotMatch(bundle, /from\s+["'](?:@adversarylabs\/sdk|typescript)["']/);

  const runtime = await import(pathToFileURL(entrypoint).href) as {
    createApp(): {
      run(options: { input: unknown; model: ReviewModel }): Promise<{
        adversary: { name: string };
        findings: unknown[];
      }>;
    };
  };
  const output: TypeScriptModelOutput = {
    schemaVersion: 1,
    assessment: {
      verdict: "excellent-typescript",
      risk: "none",
      ship: true,
      summary: "The small module is coherent.",
      primaryConcern: "",
    },
    observations: [],
    strengths: [],
  };
  const model: ReviewModel = {
    async review<T>(_request: ModelReviewRequest) {
      return { output: output as T, provider: "fixture", model: "fixture" };
    },
  };
  const result = await runtime.createApp().run({
    input: { source: { path: target } },
    model,
  });
  assert.equal(result.adversary.name, "typescript");
  assert.deepEqual(result.findings, []);
});

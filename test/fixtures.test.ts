import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ModelReviewRequest, ReviewModel, ReviewResult } from "@adversarylabs/sdk";
import { createApp } from "../src/index.ts";
import type { TypeScriptModelOutput } from "../src/types.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturesRoot = join(root, "fixtures");
const fixtureNames = [
  "excellent",
  "maintainable",
  "ignored-async-work",
  "runtime-type-mismatch",
  "module-boundary",
] as const;

function snapshot(result: ReviewResult): unknown {
  return JSON.parse(JSON.stringify({
    assessment: result.assessment,
    positives: result.positives,
    observations: result.observations,
    findings: result.findings,
    opinion: result.opinion,
    suppressed: result.suppressed,
  }));
}

for (const name of fixtureNames) {
  test(`${name} matches its expected TypeScript review`, async () => {
    const fixtureRoot = join(fixturesRoot, name);
    const fixture = JSON.parse(await readFile(join(fixtureRoot, "fixture.json"), "utf8")) as {
      changedFiles: string[];
    };
    const output = JSON.parse(
      await readFile(join(fixtureRoot, "expected.model.json"), "utf8"),
    ) as TypeScriptModelOutput;
    let calls = 0;
    const model: ReviewModel = {
      async review<T>(request: ModelReviewRequest) {
        calls += 1;
        assert.match(request.prompt, /experienced TypeScript engineer/);
        return { output: output as T, provider: "fixture", model: name };
      },
    };
    const result = await createApp().run({
      input: {
        source: { path: fixtureRoot },
        change: {
          scan_mode: "changed",
          changed_files: fixture.changedFiles,
          base_ref: "base",
          head_ref: "head",
        },
      },
      model,
    });
    assert.equal(calls, 1, "fixture concern must not require a rewrite call");
    const actual = snapshot(result);
    const expectedPath = join(fixtureRoot, "expected.review.json");
    if (process.env.UPDATE_SNAPSHOTS === "1") {
      await writeFile(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
    } else {
      assert.deepEqual(actual, JSON.parse(await readFile(expectedPath, "utf8")));
    }
  });
}

test("fixture catalog contains exactly five calibration scenarios", async () => {
  const names = (await readdir(fixturesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(names, [...fixtureNames].sort());
});

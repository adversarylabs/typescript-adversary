import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAdversaryManifest } from "@adversarylabs/sdk";
import { isTypeScriptSource, SOURCE_PATTERNS } from "../src/discover.ts";

test("declares TypeScript detection and model permission", async () => {
  const source = await readFile(new URL("../adversary.yaml", import.meta.url), "utf8");
  const manifest = parseAdversaryManifest(source);

  assert.equal(manifest.triggers?.manual, true);
  assert.deepEqual(manifest.detection?.files, manifest.triggers?.files_changed);
  assert.deepEqual(manifest.detection?.files?.slice(0, SOURCE_PATTERNS.length), [...SOURCE_PATTERNS]);
  assert.equal(manifest.permissions?.model, true);
  assert.equal(manifest.permissions?.network, false);
});

test("source detection covers TypeScript variants without generated dependencies", () => {
  for (const path of ["index.ts", "src/view.tsx", "src/worker.mts", "src/config.cts", "types/api.d.ts"]) {
    assert.equal(isTypeScriptSource(path), true, path);
  }
  for (const path of ["src/app.js", "node_modules/pkg/index.ts", "dist/index.ts", "src/api.generated.ts"]) {
    assert.equal(isTypeScriptSource(path), false, path);
  }
});

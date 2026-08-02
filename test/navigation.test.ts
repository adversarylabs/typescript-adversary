import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { openRepoIndex } from "@adversarylabs/sdk";
import { productionImporters } from "../src/navigation.js";

async function writeIndex(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "meta.json"),
    JSON.stringify({
      schemaVersion: "v1",
      fingerprint: "test",
      repoPath: "/fixture",
      fileCount: 4,
      edgeCount: 3,
    }) + "\n",
  );
  await writeFile(
    join(dir, "files.jsonl"),
    [
      JSON.stringify({ path: "src/util.ts", language: "typescript", size: 1, hash: "a" }),
      JSON.stringify({ path: "src/main.ts", language: "typescript", size: 1, hash: "b" }),
      JSON.stringify({ path: "src/util.test.ts", language: "typescript", size: 1, hash: "c" }),
      JSON.stringify({ path: "src/app.tsx", language: "typescript", size: 1, hash: "d" }),
    ].join("\n") + "\n",
  );
  await writeFile(
    join(dir, "edges.jsonl"),
    [
      JSON.stringify({ from: "src/main.ts", to: "src/util.ts", kind: "import" }),
      JSON.stringify({ from: "src/app.tsx", to: "src/util.ts", kind: "import" }),
      JSON.stringify({ from: "src/util.test.ts", to: "src/util.ts", kind: "import" }),
    ].join("\n") + "\n",
  );
}

test("productionImporters uses shared repo index edges and skips test/spec importers", async () => {
  const dir = join(tmpdir(), `typescript-nav-${Date.now()}`);
  await writeIndex(dir);
  const index = await openRepoIndex(dir);
  const importers = await productionImporters(index, "src/util.ts");
  assert.deepEqual(importers, ["src/app.tsx", "src/main.ts"]);
});

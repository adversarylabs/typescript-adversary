import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { loadInScopeSources, type ModelReviewRequest, type ReviewModel, type RuleContext } from "@adversarylabs/sdk";
import { analyzeTypeScript } from "../src/analyze.ts";
import { discoverSources } from "../src/discover.ts";
import { createApp } from "../src/index.ts";
import type { TypeScriptModelOutput } from "../src/types.ts";

const execute = promisify(execFile);

test("an unrelated edit does not surface a legacy deterministic finding", async () => {
  const repo = await committedRepository({ "src/sample.ts": tsIgnoreSource("old diagnostic") });
  await writeFile(join(repo, "src/sample.ts"), tsIgnoreSource("new diagnostic"));

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  assert.equal(signals.some((signal) => signal.ruleId === "typescript.ts-ignore"), false);
  const output = await changedReview(repo, ["src/sample.ts"]);
  assert.equal(output.findings.some((finding) => finding.ruleId === "typescript.ts-ignore"), false);
});

test("a changed line-pattern finding remains eligible", async () => {
  const repo = await committedRepository({ "src/sample.ts": "export const value = missing;\n" });
  await writeFile(join(repo, "src/sample.ts"), "// @ts-ignore\nexport const value = missing;\n");

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  const signal = signals.find((item) => item.ruleId === "typescript.ts-ignore");
  assert.ok(signal);
  assert.equal(signal.line, 1);
});

test("a changed occurrence is found after an unchanged legacy occurrence", async () => {
  const original = `// @ts-ignore
export const first = missingOne;
export const second = missingTwo;
`;
  const updated = original.replace("export const second", "// @ts-ignore\nexport const second");
  const repo = await committedRepository({ "src/sample.ts": original });
  await writeFile(join(repo, "src/sample.ts"), updated);

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  const ignores = signals.filter((item) => item.ruleId === "typescript.ts-ignore");
  assert.deepEqual(ignores.map((signal) => signal.line), [3]);
});

test("an AST finding anchors on the changed async semantic token", async () => {
  const original = forEachSource(false, "unchanged");
  const repo = await committedRepository({ "src/sample.ts": original });
  await writeFile(join(repo, "src/sample.ts"), forEachSource(true, "unchanged"));

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  const signal = signals.find((item) => item.ruleId === "typescript.async.ignored-foreach");
  assert.ok(signal);
  assert.equal(signal.line, 2);
});

test("an unrelated edit inside a legacy async callback does not reactivate it", async () => {
  const original = forEachSource(true, "old diagnostic");
  const repo = await committedRepository({ "src/sample.ts": original });
  await writeFile(join(repo, "src/sample.ts"), forEachSource(true, "new diagnostic"));

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  assert.equal(
    signals.some((signal) => signal.ruleId === "typescript.async.ignored-foreach"),
    false,
  );
});

test("a changed double-cast type token remains eligible with unchanged expression context", async () => {
  const original = "export const config = source as unknown as unknown;\n";
  const repo = await committedRepository({ "src/sample.ts": original });
  await writeFile(join(repo, "src/sample.ts"), "export const config = source as unknown as Config;\n");

  const signals = await changedSignals(repo, ["src/sample.ts"]);

  assert.equal(signals.some((signal) => signal.ruleId === "typescript.double-cast"), true);
});

test("unchanged project sources remain model context but cannot emit deterministic findings", async () => {
  const repo = await committedRepository({
    "src/changed.ts": "export const changed = 1;\n",
    "src/context.ts": tsIgnoreSource("context"),
  });
  await writeFile(join(repo, "src/changed.ts"), "export const changed = 2;\n");

  const discovery = await discoverSources(changedContext(repo, ["src/changed.ts"]));
  assert.equal(discovery.sources.find((source) => source.path === "src/context.ts")?.revision, "context");
  assert.equal(analyzeTypeScript(discovery).some((signal) => signal.path === "src/context.ts"), false);

  let modelPaths: string[] = [];
  await changedReview(repo, ["src/changed.ts"], modelCapturingPaths((paths) => { modelPaths = paths; }));
  assert.equal(modelPaths.includes("src/context.ts"), true);
});

test("an added TypeScript file remains fully eligible", async () => {
  const repo = await committedRepository({ "src/base.ts": "export const base = true;\n" });
  await writeRepositoryFile(repo, "src/added.ts", tsIgnoreSource("added"));

  const signals = await changedSignals(repo, ["src/added.ts"]);

  assert.equal(signals.some((signal) => signal.ruleId === "typescript.ts-ignore"), true);
});

test("an all-files review remains fully eligible", async () => {
  const repo = await committedRepository({ "src/sample.ts": tsIgnoreSource("old diagnostic") });
  await writeFile(join(repo, "src/sample.ts"), tsIgnoreSource("new diagnostic"));
  const change: RuleContext["change"] = {
    type: "diff",
    baseRef: "HEAD",
    headRef: "WORKTREE",
    scanMode: "all",
    changedFiles: ["src/sample.ts"],
    worktree: true,
  };

  const discovery = await discoverSources(context(repo, change));

  assert.equal(discovery.sources.find((source) => source.path === "src/sample.ts")?.revision, "repository");
  assert.equal(analyzeTypeScript(discovery).some((signal) => signal.ruleId === "typescript.ts-ignore"), true);
});

test("a review without change metadata remains fully eligible", async () => {
  const repo = await committedRepository({ "src/sample.ts": tsIgnoreSource("repository") });

  const discovery = await discoverSources(context(repo, null));

  assert.equal(discovery.sources.find((source) => source.path === "src/sample.ts")?.revision, "repository");
  assert.equal(analyzeTypeScript(discovery).some((signal) => signal.ruleId === "typescript.ts-ignore"), true);
});

async function changedSignals(repo: string, changedFiles: string[]) {
  return analyzeTypeScript(await discoverSources(changedContext(repo, changedFiles)));
}

async function committedRepository(files: Record<string, string>): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "typescript-adversary-scope-"));
  await execute("git", ["init", "--quiet"], { cwd: repo });
  await execute("git", ["config", "user.email", "tests@example.com"], { cwd: repo });
  await execute("git", ["config", "user.name", "Tests"], { cwd: repo });
  for (const [path, source] of Object.entries(files)) await writeRepositoryFile(repo, path, source);
  await execute("git", ["add", "."], { cwd: repo });
  await execute("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repo });
  return repo;
}

async function writeRepositoryFile(repo: string, path: string, source: string): Promise<void> {
  await mkdir(join(repo, dirname(path)), { recursive: true });
  await writeFile(join(repo, path), source);
}

function changedContext(repo: string, changedFiles: string[]): RuleContext {
  return context(repo, {
    type: "diff",
    baseRef: "HEAD",
    headRef: "WORKTREE",
    scanMode: "changed",
    changedFiles,
    worktree: true,
  });
}

function context(repoPath: string, change: RuleContext["change"]): RuleContext {
  return {
    repoPath,
    change,
    repoIndex: null,
    summary: {},
    cache: new Map(),
    relpath: (path) => path,
    glob: async () => [],
    rglob: async (pattern) => {
      const { glob } = await import("node:fs/promises");
      const paths: string[] = [];
      for await (const path of glob(pattern, { cwd: repoPath })) paths.push(path);
      return paths;
    },
    listInScopePaths: async () => [],
    loadInScopeSources: async (options) => loadInScopeSources(repoPath, change, options),
    model: {} as RuleContext["model"],
    observe: () => {},
    finding: () => {},
    review: {
      assessment: () => {}, positive: () => {}, observe: () => {}, score: () => {}, opinion: () => {},
    },
  };
}

async function changedReview(repoPath: string, changedFiles: string[], model = cleanModel()) {
  return createApp().run({
    input: {
      source: { path: repoPath },
      change: {
        type: "diff", base_ref: "HEAD", head_ref: "WORKTREE",
        scan_mode: "changed", changed_files: changedFiles,
      },
    },
    model,
  });
}

function cleanModel(): ReviewModel {
  return modelCapturingPaths(() => {});
}

function modelCapturingPaths(capture: (paths: string[]) => void): ReviewModel {
  const output: TypeScriptModelOutput = {
    schemaVersion: 1,
    assessment: {
      verdict: "excellent-typescript", risk: "none", ship: true,
      summary: "The reviewed TypeScript change is coherent and has no additional material concern.",
      primaryConcern: "",
    },
    observations: [],
    strengths: [],
  };
  return {
    async review<T>(request: ModelReviewRequest) {
      capture((request.input as { sources: Array<{ path: string }> }).sources.map((source) => source.path));
      return { output: output as T, provider: "fixture", model: "fixture" };
    },
  };
}

function tsIgnoreSource(diagnostic: string): string {
  return `// @ts-ignore
export const value = missing;
export const diagnostic = ${JSON.stringify(diagnostic)};
`;
}

function forEachSource(asyncCallback: boolean, diagnostic: string): string {
  return `export async function run(items: string[]) {
  items.forEach(${asyncCallback ? "async " : ""}item => {
    await save(item);
    console.log(${JSON.stringify(diagnostic)});
  });
}
`;
}

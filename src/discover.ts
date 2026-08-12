import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RuleContext } from "@adversarylabs/sdk";
import type { Discovery, SourceFile } from "./types.js";

export const SOURCE_PATTERNS = [
  "*.ts", "**/*.ts",
  "*.tsx", "**/*.tsx",
  "*.mts", "**/*.mts",
  "*.cts", "**/*.cts",
] as const;

const MAX_FILES = 36;
const MAX_FILE_CHARACTERS = 12_000;
const MAX_TOTAL_CHARACTERS = 220_000;
const execute = promisify(execFile);
const ignored = new Set([
  ".git", ".next", "__fixtures__", "build", "coverage", "dist", "fixture", "fixtures",
  "generated", "node_modules", "target", "testdata", "vendor",
]);

function normalize(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function isTypeScriptSource(path: string): boolean {
  const normalized = normalize(path);
  if (normalized.split("/").some((segment) => ignored.has(segment))) return false;
  return /\.(?:ts|tsx|mts|cts)$/.test(normalized) &&
    !/(?:\.generated\.[cm]?ts|\.min\.js)$/.test(normalized);
}

function priority(path: string, changed: ReadonlySet<string>): number {
  if (changed.has(path)) return 0;
  if (/(?:^|\/)(?:test|tests|__tests__)\//.test(path) || /\.(?:test|spec)\.[cm]?tsx?$/.test(path)) {
    return 2;
  }
  if (/\.d\.[cm]?ts$/.test(path)) return 3;
  return 1;
}

export async function discoverSources(ctx: RuleContext): Promise<Discovery> {
  const changed = new Set((ctx.change?.changedFiles ?? []).map(normalize));
  const matches = (await Promise.all(SOURCE_PATTERNS.map((pattern) => ctx.rglob(pattern)))).flat();
  const paths = [...new Set(matches.map(normalize).filter(isTypeScriptSource))].sort(
    (left, right) => priority(left, changed) - priority(right, changed) ||
      left.localeCompare(right),
  );
  for (const metadata of ["package.json", "tsconfig.json"]) {
    try {
      await readFile(join(ctx.repoPath, metadata), "utf8");
      paths.push(metadata);
    } catch {
      // Optional project context.
    }
  }
  paths.sort((left, right) => priority(left, changed) - priority(right, changed) ||
    left.localeCompare(right));

  const sources: SourceFile[] = [];
  const wholeTarget = ctx.change === null || ctx.change.scanMode === "all";
  let totalCharacters = 0;
  for (const path of paths.slice(0, MAX_FILES)) {
    if (totalCharacters >= MAX_TOTAL_CHARACTERS) break;
    let raw: string;
    try {
      raw = await readFile(join(ctx.repoPath, path), "utf8");
    } catch {
      continue;
    }
    if (raw.includes("\0")) continue;
    const allowance = Math.min(MAX_FILE_CHARACTERS, MAX_TOTAL_CHARACTERS - totalCharacters);
    const content = raw.slice(0, allowance);
    const status = changed.has(path) ? "changed" as const : "context" as const;
    const revision = wholeTarget
      ? { changedLines: new Set<number>(), revision: "repository" as const }
      : status === "context"
        ? { changedLines: new Set<number>(), revision: "context" as const }
        : await changedSource(ctx, path);
    sources.push({
      id: `source:${sources.length + 1}`,
      path,
      status,
      revision: revision.revision,
      changedLines: revision.changedLines,
      content,
      lines: content.split(/\r?\n/),
      truncated: content.length < raw.length,
    });
    totalCharacters += content.length;
  }

  return {
    sources,
    candidates: paths.length,
    omitted: Math.max(0, paths.length - sources.length),
    totalCharacters,
  };
}

async function changedSource(
  ctx: RuleContext,
  path: string,
): Promise<Pick<SourceFile, "changedLines" | "revision">> {
  const base = ctx.change?.baseRef;
  if (base === undefined || !(await existsAtRevision(ctx.repoPath, base, path))) {
    return { changedLines: new Set<number>(), revision: "added" };
  }

  const args = ["diff", "--unified=0", base];
  const head = ctx.change?.headRef;
  if (head !== undefined && !ctx.change?.worktree) args.push(head);
  args.push("--", path);
  const patch = await gitOutput(ctx.repoPath, args);
  return { changedLines: changedLineNumbers(patch), revision: "modified" };
}

async function existsAtRevision(repoPath: string, revision: string, path: string): Promise<boolean> {
  try {
    await execute("git", ["-C", repoPath, "cat-file", "-e", `${revision}:${path}`], {
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function gitOutput(repoPath: string, args: string[]): Promise<string> {
  const result = await execute("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout;
}

function changedLineNumbers(patch: string): Set<number> {
  const lines = new Set<number>();
  for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  return lines;
}

import type { RepoIndex, RuleContext } from "@adversarylabs/sdk";
import type { DeterministicSignal } from "./types.js";

/**
 * Uses the CLI-built repository index to attach importer navigation for
 * TypeScript signals (which modules import a file that carries a finding).
 */
export async function attachImportNavigation(
  ctx: RuleContext,
  signals: DeterministicSignal[],
): Promise<void> {
  if (ctx.repoIndex === null || ctx.repoIndex === undefined) {
    return;
  }
  const index = ctx.repoIndex;
  const seen = new Set<string>();

  for (const signal of signals) {
    if (signal.disposition !== "finding") {
      continue;
    }
    const importers = await productionImporters(index, signal.path);
    if (importers.length === 0) {
      continue;
    }
    const key = `typescript.navigation.importers:${signal.path}:${signal.ruleId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ctx.review.observe({
      key,
      summary: `${signal.ruleId} in ${signal.path} is imported by production module(s): ${importers.slice(0, 8).join(", ")}.`,
      metadata: {
        role: "navigation",
        source: "repo-index",
        signalPath: signal.path,
        ruleId: signal.ruleId,
        importers: importers.slice(0, 20),
      },
      evidence: [
        {
          location: { file: signal.path, line: signal.line },
          message: signal.summary,
          data: { importers: importers.slice(0, 12) },
        },
      ],
    });
  }
}

/** Exported for unit tests — resolves importers of a TS/JS file via relative edges. */
export async function productionImporters(
  index: RepoIndex,
  filePath: string,
): Promise<string[]> {
  const normalized = filePath.replaceAll("\\", "/");
  const edges = await index.importersOf(normalized);
  const from = new Set<string>();
  for (const edge of edges) {
    if (edge.kind !== "import") {
      continue;
    }
    if (isTestOrSpecPath(edge.from)) {
      continue;
    }
    if (edge.from === normalized) {
      continue;
    }
    from.add(edge.from);
  }
  return [...from].sort();
}

function isTestOrSpecPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes("/__tests__/") || lower.includes("/__mocks__/")) {
    return true;
  }
  if (lower.includes("/test/") || lower.includes("/tests/")) {
    return true;
  }
  // *.test.ts, *.spec.tsx, *.test.mts, etc.
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(lower);
}

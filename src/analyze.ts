import ts from "typescript";
import type { DeterministicSignal, Discovery, SourceFile } from "./types.js";

export function analyzeTypeScript(discovery: Discovery): DeterministicSignal[] {
  const signals: DeterministicSignal[] = [];
  for (const source of discovery.sources) {
    if (!/\.(?:ts|tsx|mts|cts)$/.test(source.path)) continue;
    analyzeSource(source, signals);
  }
  signals.push(...moduleConfigurationSignals(discovery));
  return signals.sort((left, right) =>
    left.path.localeCompare(right.path) || left.line - right.line || left.ruleId.localeCompare(right.ruleId));
}

function analyzeSource(source: SourceFile, signals: DeterministicSignal[]): void {
  const kind = source.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(source.path, source.content, ts.ScriptTarget.Latest, true, kind);

  // CHECKS: typescript.ts-ignore
  source.lines.forEach((line, index) => {
    if (!isEligibleLine(source, index + 1)) return;
    if (/@ts-ignore\b/.test(line) || (/@ts-nocheck\b/.test(line) && !/generated|\\.d\.ts/.test(source.path))) {
      signals.push({
        id: `typescript.ts-ignore:${source.path}:${index + 1}`,
        path: source.path,
        line: index + 1,
        snippet: line.slice(0, 300),
        ruleId: "typescript.ts-ignore",
        disposition: "finding",
        category: "type-system",
        severity: "medium",
        confidence: "high",
        title: "Compiler errors suppressed with @ts-ignore or @ts-nocheck",
        summary: "A TypeScript suppression directive disables compiler checking for this code.",
        whyItMatters: "@ts-ignore suppresses whatever error is present, including new ones introduced later.",
        recommendation: "Fix the type error, or use @ts-expect-error with a reason when suppression is required.",
      });
    }
  });

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isForEach(node) && isAsyncFunction(node.arguments[0])) {
      pushSignal(signals, source, file, [node.expression, asyncModifier(node.arguments[0])], {
        ruleId: "typescript.async.ignored-foreach",
        disposition: "finding",
        category: "async-correctness",
        severity: "high",
        confidence: "high",
        title: "Async work is discarded by forEach",
        summary: "An async callback is passed to forEach, which does not observe or await the returned promises.",
        whyItMatters: "The containing operation can complete before the callback work, and callback rejections can escape the intended error path.",
        recommendation: "Use an awaited loop for ordered work or await Promise.all over an explicit map for intentional concurrency.",
      });
    }
    if (ts.isNewExpression(node) && isPromiseConstructor(node) && isAsyncFunction(node.arguments?.[0])) {
      pushSignal(signals, source, file, [node.expression, asyncModifier(node.arguments?.[0])], {
        ruleId: "typescript.async.async-promise-executor",
        disposition: "finding",
        category: "async-correctness",
        severity: "high",
        confidence: "high",
        title: "Promise uses an async executor",
        summary: "The Promise constructor receives an async executor whose returned promise is ignored by the constructor.",
        whyItMatters: "Exceptions after an await can reject the executor's hidden promise instead of the Promise being constructed.",
        recommendation: "Remove the Promise constructor and return the async operation, or use a synchronous executor that explicitly wires resolution and rejection.",
      });
    }
    if (ts.isCallExpression(node) && isAwaitedEmptyCatch(node)) {
      pushSignal(signals, source, file, [
        ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression,
        node.arguments[0],
      ], {
        ruleId: "typescript.async.swallowed-awaited-rejection",
        disposition: "context",
        category: "async-correctness",
        severity: "medium",
        confidence: "high",
        title: "Awaited operation silently discards its rejection",
        summary: "An awaited operation appends an empty catch handler, converting rejection into apparent success.",
        whyItMatters: "If the operation establishes readiness or performs required work, the enclosing function continues after failure with no signal that its prerequisite was not met.",
        recommendation: "Let required failures reject, or handle the error explicitly with a real fallback, translated error, or documented best-effort path.",
      });
    }
    if (ts.isAsExpression(node) && ts.isAsExpression(node.expression) &&
      (node.expression.type.kind === ts.SyntaxKind.UnknownKeyword ||
        node.expression.type.kind === ts.SyntaxKind.AnyKeyword)) {
      pushSignal(signals, source, file, [node.expression.type, node.type], {
        ruleId: "typescript.double-cast",
        disposition: "context",
        category: "type-system",
        severity: "medium",
        confidence: "high",
        title: "Type laundering via double cast",
        summary: "A value is cast through unknown or any before being asserted to another type.",
        whyItMatters: "The compiler can no longer prove that the source and target types overlap.",
        recommendation: "Restore a typed boundary or isolate and validate the conversion where the runtime representation is known.",
      });
    }
    if (ts.isAsExpression(node) && ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.expression.getText(file) === "JSON" &&
      node.expression.expression.name.text === "parse") {
      pushSignal(signals, source, file, [node.expression.expression.name, node.type], {
        ruleId: "typescript.boundary-cast",
        disposition: "context",
        category: "runtime-type-alignment",
        severity: "medium",
        confidence: "high",
        title: "External data typed by assertion instead of validation",
        summary: "JSON.parse output is immediately asserted to a compile-time type.",
        whyItMatters: "The assertion changes no runtime behavior, so external data can violate the type while appearing trusted downstream.",
        recommendation: "Validate the parsed value at the boundary or keep it unknown until narrowing establishes the required shape.",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}

function moduleConfigurationSignals(discovery: Discovery): DeterministicSignal[] {
  const out: DeterministicSignal[] = [];
  for (const config of discovery.sources.filter((s) => /(^|\/)tsconfig.*\.json$/.test(s.path))) {
    if (/["']strict["']\s*:\s*false/.test(config.content) ||
        /["']strictNullChecks["']\s*:\s*false/.test(config.content) ||
        /["']noImplicitAny["']\s*:\s*false/.test(config.content)) {
      const line = config.lines.findIndex((l) => /strict|noImplicitAny|strictNullChecks/.test(l) && /false/.test(l)) + 1 || 1;
      if (!isEligibleLine(config, line)) continue;
      out.push({
        id: `typescript.strict-disabled:${config.path}:${line}`,
        path: config.path,
        line,
        snippet: config.lines[Math.max(0, line - 1)]?.slice(0, 300) ?? "",
        ruleId: "typescript.strict-disabled",
        disposition: "finding",
        category: "type-system",
        severity: "medium",
        confidence: "high",
        title: "Strict type checking is disabled",
        summary: "TypeScript strictness is turned off or explicitly weakened in this config.",
        whyItMatters: "Without strict checks the compiler misses the null/any bug classes TypeScript is adopted for.",
        recommendation: "Enable strict and migrate incrementally with scoped configs.",
      });
    }
  }
  const pkg = discovery.sources.find((source) => source.path === "package.json");
  const config = discovery.sources.find((source) => source.path === "tsconfig.json");
  if (pkg === undefined || config === undefined) return out;
  try {
    const packageJson = JSON.parse(pkg.content) as { type?: unknown };
    const tsconfig = JSON.parse(config.content) as {
      compilerOptions?: { module?: unknown };
    };
    const module = String(tsconfig.compilerOptions?.module ?? "").toLowerCase();
    if (packageJson.type === "module" && ["commonjs", "node16-commonjs"].includes(module)) {
      const fields = {
        ruleId: "typescript.modules.incompatible-config" as const,
        disposition: "finding" as const,
        category: "module-boundaries" as const,
        severity: "medium" as const,
        confidence: "high" as const,
        title: "Package and compiler module contracts disagree",
        summary: "package.json declares ESM while TypeScript is configured to emit CommonJS.",
        whyItMatters: "Node interprets emitted JavaScript using the package contract, so CommonJS output can fail at startup or expose the wrong module shape.",
        recommendation: "Align the compiler module mode with the package's Node runtime contract and validate the built entrypoint.",
      };
      const packageLine = jsonFieldLine(pkg, "type");
      const configLine = jsonFieldLine(config, "module");
      return out.concat([
        {
          ...fields,
          id: `typescript.modules.incompatible-config:package.json:${packageLine}`,
          path: "package.json",
          line: packageLine,
          snippet: pkg.lines.slice(Math.max(0, packageLine - 2), packageLine + 1)
            .join("\n").slice(0, 300),
        },
        {
          ...fields,
          id: `typescript.modules.incompatible-config:tsconfig.json:${configLine}`,
          path: "tsconfig.json",
          line: configLine,
          snippet: config.lines.slice(Math.max(0, configLine - 2), configLine + 1)
            .join("\n").slice(0, 300),
        },
      ].filter((signal) => {
        const source = signal.path === pkg.path ? pkg : config;
        return isEligibleLine(source, signal.line);
      }));
    }
  } catch {
    return out;
  }
  return out;
}

function jsonFieldLine(source: SourceFile, field: string): number {
  const index = source.lines.findIndex((line) => line.includes(`"${field}"`));
  return index < 0 ? 1 : index + 1;
}

function isForEach(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "forEach";
}

function isPromiseConstructor(node: ts.NewExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === "Promise";
}

function isAsyncFunction(node: ts.Expression | undefined): boolean {
  return node !== undefined &&
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true;
}

function asyncModifier(node: ts.Expression | undefined): ts.Node | undefined {
  if (node === undefined || (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node))) return undefined;
  return node.modifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
}

function isAwaitedEmptyCatch(node: ts.CallExpression): boolean {
  if (!ts.isAwaitExpression(node.parent) || !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== "catch") return false;
  const handler = node.arguments[0];
  return handler !== undefined &&
    (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
    ts.isBlock(handler.body) && handler.body.statements.length === 0;
}

function pushSignal(
  signals: DeterministicSignal[],
  source: SourceFile,
  file: ts.SourceFile,
  anchors: Array<ts.Node | undefined>,
  fields: Omit<DeterministicSignal, "id" | "path" | "line" | "snippet">,
): void {
  const line = eligibleNodeAnchor(source, file, anchors);
  if (line === undefined) return;
  signals.push({
    ...fields,
    id: `${fields.ruleId}:${source.path}:${line}`,
    path: source.path,
    line,
    snippet: source.lines.slice(Math.max(0, line - 2), line + 1).join("\n").slice(0, 400),
  });
}

function eligibleNodeAnchor(
  source: SourceFile,
  file: ts.SourceFile,
  anchors: Array<ts.Node | undefined>,
): number | undefined {
  if (source.revision === "context") return undefined;
  const concrete = anchors.filter((node): node is ts.Node => node !== undefined);
  if (source.revision !== "modified") {
    const first = concrete[0];
    return first === undefined ? 1 : file.getLineAndCharacterOfPosition(first.getStart(file)).line + 1;
  }
  for (const node of concrete) {
    const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const end = file.getLineAndCharacterOfPosition(Math.max(node.getStart(file), node.getEnd() - 1)).line + 1;
    const line = eligibleAnchor(source, start, end);
    if (line !== undefined) return line;
  }
  return undefined;
}

function eligibleAnchor(source: SourceFile, startLine: number, endLine: number): number | undefined {
  if (source.revision === "context") return undefined;
  if (source.revision !== "modified") return startLine;
  for (let line = startLine; line <= endLine; line += 1) {
    if (source.changedLines.has(line)) return line;
  }
  return undefined;
}

function isEligibleLine(source: SourceFile, line: number): boolean {
  if (source.revision === "context") return false;
  return source.revision !== "modified" || source.changedLines.has(line);
}

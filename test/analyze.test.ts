import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeTypeScript } from "../src/analyze.ts";
import type { Discovery } from "../src/types.ts";

function analyze(content: string) {
  const discovery: Discovery = {
    candidates: 1,
    omitted: 0,
    totalCharacters: content.length,
    sources: [{
      id: "source:1",
      path: "src/sample.ts",
      status: "changed",
      revision: "added",
      changedLines: new Set<number>(),
      content,
      lines: content.split("\n"),
      truncated: false,
    }],
  };
  return analyzeTypeScript(discovery);
}

test("detects async forEach and async Promise executors", () => {
  const signals = analyze(`
async function run(items: string[]) {
  items.forEach(async item => { await save(item); });
  return new Promise(async resolve => { await save("done"); resolve(); });
}`);
  assert.deepEqual(
    signals.filter((signal) => signal.disposition === "finding").map((signal) => signal.ruleId),
    [
      "typescript.async.ignored-foreach",
      "typescript.async.async-promise-executor",
    ],
  );
});

test("prepares assertion and JSON boundary facts without deterministic findings", () => {
  const signals = analyze(`
interface Config { retries: number }
const config = JSON.parse(raw) as Config;
const forced = source as unknown as Config;
`);
  assert.deepEqual(signals.map((signal) => signal.ruleId), [
    "typescript.boundary-cast",
    "typescript.double-cast",
  ]);
  assert.equal(signals.every((signal) => signal.disposition === "context"), true);
});

test("does not flag awaited loops or synchronous Promise executors", () => {
  const signals = analyze(`
async function run(items: string[]) {
  for (const item of items) await save(item);
  return new Promise(resolve => resolve());
}`);
  assert.deepEqual(signals, []);
});

test("prepares empty catch handlers on awaited operations for async judgment", async () => {
  const content = await readFile(
    new URL("./fixtures/swallowed-awaited-rejection/vulnerable.ts", import.meta.url),
    "utf8",
  );
  const signals = analyze(content);
  assert.deepEqual(signals.map((item) => ({ ruleId: item.ruleId, disposition: item.disposition })), [
    {
      ruleId: "typescript.async.swallowed-awaited-rejection",
      disposition: "context",
    },
  ]);
});

test("does not prepare explicit recovery or detached best-effort rejection handlers", async () => {
  const content = await readFile(
    new URL("./fixtures/swallowed-awaited-rejection/clean.ts", import.meta.url),
    "utf8",
  );
  const signals = analyze(content);
  assert.deepEqual(signals, []);
});

// Facts are context only: the model must establish string semantics and consumer impact.
test("prepares unreachable split fallback with its changed evidence", () => {
  const signals = analyze(`function saveText(raw: string) {
const lines = raw.split("\\n");
save(lines.length > 0 ? lines : undefined);
}`);
  const signal = signals.find(s => s.ruleId === "typescript.split.empty-fallback");
  assert.ok(signal);
  assert.equal(signal.disposition, "context");
  assert.equal(signal.line, 2);
  assert.deepEqual("".split("\n"), [""]);
});
test("does not seed filtered splits, empty separators, zero limits or shadowed callbacks", () => {
  for (const body of [
    'const lines = raw.split("\\n").filter(Boolean); save(lines.length ? lines : undefined);',
    'const lines = raw.split(""); save(lines.length ? lines : undefined);',
    'const lines = raw.split("\\n", 0); save(lines.length ? lines : undefined);',
    'const lines = raw.split("\\n"); queue((lines: string[]) => save(lines.length ? lines : undefined));',
  ]) assert.equal(analyze(`function saveText(raw: string) { ${body} }`).some(s => s.ruleId === "typescript.split.empty-fallback"), false);
});

test("split fallback covers module scope, truthiness and positive literal limits", () => {
  for (const guard of ["lines.length", "lines.length > 0"]) {
    assert.equal(analyze(`const lines = "".split("\\n", 1); save(${guard} ? lines : undefined);`).filter(s => s.ruleId === "typescript.split.empty-fallback").length, 1);
  }
  for (const limit of ["0", "4294967296", "limit", "0.5"]) {
    assert.equal(analyze(`const lines = "".split("\\n", ${limit}); save(lines.length ? lines : undefined);`).some(s => s.ruleId === "typescript.split.empty-fallback"), false);
  }
});

test("prepares adjacent if guards but never emits a native-string finding for custom split", () => {
  assert.equal(analyze('const lines = "".split("\\n"); if (lines.length) save(lines); else save(undefined);').filter(s => s.ruleId === "typescript.split.empty-fallback").length, 1);
  const signals = analyze('const lines = parser.split("\\n"); save(lines.length ? lines : undefined);');
  assert.equal(signals.filter(s => s.ruleId === "typescript.split.empty-fallback").length, 1);
  assert.ok(signals.every(s => s.disposition === "context"));
  assert.match(signals[0]!.whyItMatters, /For a string receiver/);
});

test("split facts are bounded to the next guard and deduplicated per declaration", () => {
 const signals = (text: string) => analyze(text).filter(s => s.ruleId === "typescript.split.empty-fallback");
 assert.equal(signals('const a = "".split("\\n"); const b = "".split("\\n"); save(b.length ? b : undefined);').length, 1);
 assert.equal(signals('const a = "".split("\\n"); if (a.length) { save(a.length ? a : undefined); }').length, 1);
 assert.equal(signals('const a = "".split("\\n"); { const a = []; save(a.length ? a : undefined); }').length, 0);
 assert.equal(signals('const a = "".split("\\n", -1); save(a.length ? a : undefined);').length, 1);
 assert.equal(signals('const a = "".split("\\n", -4294967296); save(a.length ? a : undefined);').length, 0);
});

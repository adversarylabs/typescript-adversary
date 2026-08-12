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

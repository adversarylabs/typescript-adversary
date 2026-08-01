import assert from "node:assert/strict";
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

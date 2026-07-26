import assert from "node:assert/strict";
import test from "node:test";
import { mapResult, type Result, valueOr } from "../src/result.js";

test("maps success and preserves failure", () => {
  assert.deepEqual(mapResult({ ok: true, value: 2 }, (value) => value * 2), {
    ok: true,
    value: 4,
  });
  const failure: Result<number> = { ok: false, error: new Error("failed") };
  assert.equal(mapResult(failure, String), failure);
  assert.equal(valueOr(failure, 0), 0);
});

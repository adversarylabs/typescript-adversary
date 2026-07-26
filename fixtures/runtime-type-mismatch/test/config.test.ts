import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("loads a configured retry count", () => {
  assert.equal(loadConfig('{"retries": 3, "endpoint": "https://example.com"}').retries, 3);
});

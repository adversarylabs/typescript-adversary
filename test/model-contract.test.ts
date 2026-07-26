import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TYPESCRIPT_REVIEW_PROMPT } from "../src/prompt.ts";

test("prompt is TypeScript-specific and rejects linter behavior", () => {
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /asynchronous correctness/);
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /generics, discriminated unions/);
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /Do not become a syntax or style linter/);
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /HTTP and database design/);
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /zero to four important observations/);
  assert.match(TYPESCRIPT_REVIEW_PROMPT, /quote copied exactly/);
});

test("model schema is strict and provider-compatible", async () => {
  const text = await readFile(
    new URL("../schemas/typescript-review.model.v1.schema.json", import.meta.url),
    "utf8",
  );
  const schema = JSON.parse(text);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schemaVersion", "assessment", "observations", "strengths"]);
  assert.doesNotMatch(text, /"minLength"|"maxLength"|"minItems"|"maxItems"|"\$ref"|\$defs/);
});

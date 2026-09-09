import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ModelReviewError, type ModelReviewRequest, type ReviewModel } from "@adversarylabs/sdk";
import { createApp } from "../src/index.ts";


for (const mode of ["repaired", "fabricated", "unavailable", "all-withheld", "valid-only", "duplicate-id", "new-id", "wrong-line"] as const) {
  test(`citation correction preserves supported peers: ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "citation-recovery-"));
    const source = "export const ready = true;\nexport const enabled = false;\n";
    await writeFile(join(root, "index.ts"), source);
    const good = { evidenceId: "source:1", line: 1, quote: "export const ready = true;", detail: "The current implementation uses a literal decision." };
    const bad = { ...good, evidenceId: "invented:999" };
    const observation = (id: string, evidence: typeof good) => ({
      id, title: id === "peer" ? "Centralize readiness policy" : "Centralize enablement policy",
      category: "maintainability", severity: "low", confidence: "high",
      principle: "Configuration decisions should have a clear ownership boundary.",
      summary: id === "peer" ? "The readiness setting duplicates a policy decision in this module." : "The enablement decision repeats a separate policy in this module.",
      impact: "Independent edits can leave consumers applying inconsistent configuration.",
      recommendation: "Use the existing shared configuration entrypoint for this decision.",
      tradeoffs: "", evidence: [evidence],
    });
    let repairs = 0;
    const review = async <T>(request: ModelReviewRequest) => {
      if ((request.schema.properties as Record<string, unknown>)?.repairs) {
        repairs++;
        assert.equal(request.tools, undefined);
        const input = request.input as { observations: { id: string }[] };
        assert.deepEqual(input.observations.map((o) => o.id), ["broken"]);
        if (mode === "unavailable") throw new ModelReviewError("Provider unavailable", { code: "model_timeout" });
        if (mode === "duplicate-id") return { output: { repairs: [{ id: "broken", evidence: [good] }, { id: "broken", evidence: [good] }] } as T, provider: "fixture", model: "fixture" };
        if (mode === "new-id") return { output: { repairs: [{ id: "new-claim", evidence: [good] }] } as T, provider: "fixture", model: "fixture" };
        if (mode === "wrong-line") return { output: { repairs: [{ id: "broken", evidence: [{ ...good, line: 999, quote: "not found in the prepared source" }] }] } as T, provider: "fixture", model: "fixture" };
        return { output: { repairs: [{ id: "broken", evidence: [mode === "repaired" ? { ...good, line: 2, quote: "export const enabled = false;" } : bad] }] } as T, provider: "fixture", model: "fixture" };
      }
      return { output: {
        schemaVersion: 1,
        assessment: { verdict: "ready-with-minor-improvements", risk: "low", ship: true, summary: "The implementation has a few localized policy ownership improvements.", primaryConcern: "" },
        observations: mode === "valid-only" ? [observation("peer", good)] : [
          ...(mode === "all-withheld" ? [] : [observation("peer", good)]),
          observation("broken", bad),
        ], strengths: [],
      } as T, provider: "fixture", model: "fixture" };
    };
    const model: ReviewModel = { review };
    const result = await createApp().run({ input: { source: { path: root } }, model });
    assert.equal(repairs, mode === "valid-only" ? 0 : 1);
    assert.equal(result.findings.length, mode === "repaired" ? 2 : mode === "all-withheld" ? 0 : 1);
    if (mode !== "repaired" && mode !== "valid-only") {
      assert.equal(result.opinion?.ship, undefined);
      assert.match(result.assessment?.summary ?? "", /Partial .*review/);
      assert.ok(result.observations.some((o) => o.key === "review.evidence-incomplete"));
    }
    assert.ok(!JSON.stringify(result.findings).includes("invented:999"));
  });
}

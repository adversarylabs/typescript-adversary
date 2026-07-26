#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Adversary } from "@adversarylabs/sdk";
import { analyzeTypeScript } from "./analyze.js";
import { discoverSources } from "./discover.js";
import { emitDeterministicSignals, runTypeScriptModelReview } from "./review.js";

export function createApp(): Adversary {
  const app = new Adversary({
    name: "typescript",
    review: { maximumFindings: 5, minimumConfidence: "medium" },
  });

  app.rule("typescript.review", async (ctx) => {
    const discovery = await discoverSources(ctx);
    const signals = analyzeTypeScript(discovery);
    ctx.summary.files_scanned = discovery.sources.length;
    emitDeterministicSignals(ctx, signals);
    await runTypeScriptModelReview(ctx, discovery, signals);
  });
  return app;
}

async function runIfDirect(): Promise<void> {
  if (
    process.argv[1] !== undefined &&
    (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)))
  ) {
    await createApp().runFromEnvironment();
  }
}

void runIfDirect();

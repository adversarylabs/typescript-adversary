import {
  formatOpinion,
  formatOpinionAsync,
  ModelReviewError,
  ModelUnavailableError,
  type EvidenceInput,
  type RuleContext,
  type Severity,
} from "@adversarylabs/sdk";
import { buildTypeScriptModelRequest } from "./model-review.js";
import type {
  DeterministicSignal,
  Discovery,
  ModelEvidence,
  ModelObservation,
  Risk,
  SourceFile,
  TypeScriptModelOutput,
} from "./types.js";

const MAX_MODEL_OBSERVATIONS = 4;
const rank: Record<Risk, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const verdicts: Record<TypeScriptModelOutput["assessment"]["verdict"], string> = {
  "excellent-typescript": "Excellent TypeScript",
  "ready-with-minor-improvements": "Ready with minor improvements",
  "async-correctness-concerns": "Async correctness concerns",
  "type-design-concerns": "Type design concerns",
  "module-boundary-concerns": "Module boundary concerns",
  "significant-maintainability-concerns": "Significant maintainability concerns",
};

export function emitDeterministicSignals(
  ctx: RuleContext,
  signals: DeterministicSignal[],
): void {
  for (const signal of signals.filter((item) => item.disposition === "finding")) {
    ctx.observe({
      ruleId: signal.ruleId,
      subject: signal.title,
      groupKey: signal.ruleId,
      category: signal.category,
      severity: signal.severity,
      confidence: signal.confidence,
      title: { singular: signal.title, plural: signal.title },
      summary: { singular: signal.summary, grouped: signal.summary },
      whyItMatters: signal.whyItMatters,
      location: {
        file: signal.path,
        line: signal.line,
        snippet: signal.snippet,
        message: signal.summary,
      },
      evidence: { signalId: signal.id },
      recommendation: signal.recommendation,
      remediation: { complexity: "small" },
      tags: ["typescript", "deterministic", signal.category],
    });
  }
}

export async function runTypeScriptModelReview(
  ctx: RuleContext,
  discovery: Discovery,
  signals: DeterministicSignal[],
): Promise<void> {
  let output: TypeScriptModelOutput;
  try {
    ({ output } = await ctx.model.review<TypeScriptModelOutput>(
      buildTypeScriptModelRequest(ctx.change, discovery, signals),
    ));
  } catch (error) {
    if (error instanceof ModelUnavailableError) {
      applyDeterministicAssessment(ctx, signals);
      return;
    }
    throw error;
  }
  assertSubstantiveOutput(output);

  const sources = new Map(discovery.sources.map((source) => [source.id, source]));
  const signalMap = new Map(signals.map((signal) => [signal.id, signal]));
  const candidates = output.observations
    .slice(0, MAX_MODEL_OBSERVATIONS)
    .filter((observation) => isActionable(observation.recommendation));
  const accepted = candidates
    .filter((observation) => emitModelObservation(ctx, observation, sources, signalMap));
  if (accepted.length !== candidates.length) {
    throw new ModelReviewError(
      "TypeScript model review cited evidence that was not present at the reported source line.",
      { code: "invalid_model_evidence", retryable: false },
    );
  }
  const staticRisk = maxRisk(signals
    .filter((signal) => signal.disposition === "finding")
    .map((signal) => signal.severity));
  const risk = maxRisk([
    output.assessment.risk,
    staticRisk,
    ...accepted.map((observation) => observation.severity),
  ]);
  const blocking = rank[staticRisk] >= rank.medium ||
    accepted.some((observation) => rank[observation.severity] >= rank.medium);
  const ship = output.assessment.ship && !blocking;

  ctx.review.assessment({
    risk,
    summary: `${verdicts[output.assessment.verdict]} — ${output.assessment.summary}`,
  });
  for (const [index, strength] of output.strengths.slice(0, 3).entries()) {
    const evidence = strength.evidenceIds
      .map((id) => {
        const source = sources.get(id);
        if (source !== undefined) {
          const quote = source.lines.find((line) => line.trim() !== "")?.trim() ?? "";
          const line = Math.max(1, source.lines.findIndex((item) => item.trim() !== "") + 1);
          return evidenceById(id, line, "Supporting TypeScript evidence.", quote, sources, signalMap);
        }
        const signal = signalMap.get(id);
        return signal === undefined
          ? undefined
          : evidenceById(id, signal.line, "Supporting TypeScript evidence.", signal.snippet, sources, signalMap);
      })
      .filter((item): item is EvidenceInput => item !== undefined);
    ctx.review.positive({
      key: `typescript.strength.${index + 1}`,
      summary: strength.summary,
      ...(evidence.length === 0 ? {} : { evidence }),
      metadata: { source: "model" },
    });
  }
  const top = accepted.slice().sort(
    (left, right) => rank[right.severity] - rank[left.severity] || left.id.localeCompare(right.id),
  )[0];
  const concern = output.assessment.primaryConcern.trim() || top?.title || staticConcern(signals);
  ctx.review.opinion(await formatOpinionAsync({
    ship,
    ...(ship || concern === undefined ? {} : { concern }),
    change: ctx.change,
    model: ctx.model,
  }));
}

function emitModelObservation(
  ctx: RuleContext,
  observation: ModelObservation,
  sources: ReadonlyMap<string, SourceFile>,
  signals: ReadonlyMap<string, DeterministicSignal>,
): boolean {
  const evidence = observation.evidence
    .map((item) => evidenceById(
      item.evidenceId,
      item.line,
      item.detail,
      item.quote,
      sources,
      signals,
    ))
    .filter((item): item is EvidenceInput => item !== undefined)
    .slice(0, 8);
  if (evidence.length === 0) return false;
  for (const item of evidence) {
    ctx.observe({
      ruleId: `typescript.model.${observation.category}`,
      subject: observation.title,
      groupKey: `typescript.model.${observation.id}`,
      deduplicate: true,
      category: observation.category,
      severity: observation.severity as Severity,
      confidence: observation.confidence,
      title: { singular: observation.title, plural: observation.title },
      summary: { singular: observation.summary, grouped: observation.summary },
      whyItMatters: `${observation.principle} ${observation.impact}`,
      impact: observation.impact,
      location: item,
      recommendation: {
        summary: observation.recommendation,
        ...(observation.tradeoffs === "" ? {} : { details: observation.tradeoffs }),
      },
      remediation: {
        complexity: observation.severity === "low"
          ? "small"
          : observation.severity === "critical"
            ? "large"
            : "medium",
      },
      tags: ["typescript", "model-backed", observation.category],
      metadata: { source: "model", observationId: observation.id },
    });
  }
  return true;
}

function evidenceById(
  id: string,
  requestedLine: number,
  detail: string,
  quote: string,
  sources: ReadonlyMap<string, SourceFile>,
  signals: ReadonlyMap<string, DeterministicSignal>,
): EvidenceInput | undefined {
  const exactQuote = quote.trim();
  if (exactQuote === "") return undefined;
  const source = sources.get(id);
  if (source !== undefined) {
    if (!Number.isInteger(requestedLine) || requestedLine < 1 || requestedLine > source.lines.length) {
      return undefined;
    }
    const nearby = source.lines.slice(Math.max(0, requestedLine - 3), requestedLine + 2).join("\n");
    if (!nearby.includes(exactQuote)) return undefined;
    return {
      location: { file: source.path, line: requestedLine },
      message: detail,
      snippet: source.lines.slice(Math.max(0, requestedLine - 2), requestedLine + 1)
        .join("\n").slice(0, 500),
      data: { evidenceId: id, status: source.status },
    };
  }
  const signal = signals.get(id);
  if (signal === undefined || !signal.snippet.includes(exactQuote)) return undefined;
  return {
    location: { file: signal.path, line: signal.line },
    message: detail,
    snippet: signal.snippet,
    data: { evidenceId: id, ruleId: signal.ruleId },
  };
}

function applyDeterministicAssessment(
  ctx: RuleContext,
  signals: DeterministicSignal[],
): void {
  const risk = maxRisk(signals
    .filter((signal) => signal.disposition === "finding")
    .map((signal) => signal.severity));
  const ship = rank[risk] < rank.medium;
  ctx.review.assessment({
    risk,
    summary: ship
      ? "No material deterministic TypeScript concerns were found; model judgment was unavailable."
      : "Material deterministic TypeScript correctness concerns require attention; model judgment was unavailable.",
  });
  ctx.review.opinion(formatOpinion({
    ship,
    ...(!ship && staticConcern(signals) !== undefined
      ? { concern: staticConcern(signals) as string }
      : {}),
    change: ctx.change,
  }));
}

function maxRisk(values: Risk[]): Risk {
  return values.reduce<Risk>((best, current) => rank[current] > rank[best] ? current : best, "none");
}

function isActionable(recommendation: string): boolean {
  return !/^\s*(?:no (?:action|change)s? (?:is |are )?(?:needed|required)|leave (?:this|it) as-is|keep (?:this|it) as-is)\b/i
    .test(recommendation);
}

function assertSubstantiveOutput(output: TypeScriptModelOutput): void {
  requireSubstantive(output.assessment.summary, 30, "assessment.summary");
  for (const [index, observation] of output.observations.entries()) {
    requireSubstantive(observation.title, 6, `observations[${index}].title`);
    requireSubstantive(observation.summary, 20, `observations[${index}].summary`);
    requireSubstantive(observation.principle, 15, `observations[${index}].principle`);
    requireSubstantive(observation.impact, 15, `observations[${index}].impact`);
    requireSubstantive(observation.recommendation, 15, `observations[${index}].recommendation`);
  }
  for (const [index, strength] of output.strengths.entries()) {
    requireSubstantive(strength.summary, 15, `strengths[${index}].summary`);
  }
}

function requireSubstantive(text: string, minimum: number, field: string): void {
  const normalized = text.trim();
  if (
    normalized.length < minimum ||
    /^(?:assessment|detail|impact|none|principle|quote|recommendation|string|summary|title|tradeoffs?)$/i
      .test(normalized)
  ) {
    throw new ModelReviewError(
      `TypeScript model review returned a placeholder or empty ${field}.`,
      { code: "invalid_model_judgment", retryable: true },
    );
  }
}

function staticConcern(signals: DeterministicSignal[]): string | undefined {
  const material = signals.find((signal) => signal.disposition === "finding");
  if (material?.ruleId === "typescript.async.ignored-foreach") return "discarded asynchronous callback work";
  if (material?.ruleId === "typescript.async.async-promise-executor") return "the unsafe asynchronous Promise executor";
  if (material?.ruleId === "typescript.modules.incompatible-config") return "the contradictory module configuration";
  return undefined;
}

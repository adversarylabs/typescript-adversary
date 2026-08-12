export type Risk = "none" | "low" | "medium" | "high" | "critical";

export interface SourceFile {
  id: string;
  path: string;
  status: "changed" | "context";
  content: string;
  lines: string[];
  truncated: boolean;
}

export interface Discovery {
  sources: SourceFile[];
  candidates: number;
  omitted: number;
  totalCharacters: number;
}

export interface DeterministicSignal {
  id: string;
  ruleId:
    | "typescript.async.ignored-foreach"
    | "typescript.async.async-promise-executor"
    | "typescript.async.swallowed-awaited-rejection"
    | "typescript.modules.incompatible-config"
    | "typescript.double-cast"
    | "typescript.boundary-cast"
    | "typescript.ts-ignore"
    | "typescript.strict-disabled"
    | "typescript.exported-any";
  disposition: "finding" | "context";
  category:
    | "async-correctness"
    | "module-boundaries"
    | "type-system"
    | "runtime-type-alignment";
  severity: "low" | "medium" | "high";
  confidence: "medium" | "high";
  title: string;
  summary: string;
  whyItMatters: string;
  recommendation: string;
  path: string;
  line: number;
  snippet: string;
}

export interface ModelEvidence {
  evidenceId: string;
  line: number;
  detail: string;
  quote: string;
}

export interface ModelObservation {
  id: string;
  title: string;
  category:
    | "async-correctness"
    | "type-system"
    | "api-design"
    | "module-boundaries"
    | "runtime-type-alignment"
    | "maintainability";
  severity: "low" | "medium" | "high" | "critical";
  confidence: "medium" | "high";
  principle: string;
  summary: string;
  impact: string;
  recommendation: string;
  tradeoffs: string;
  evidence: ModelEvidence[];
}

export interface TypeScriptModelOutput {
  schemaVersion: 1;
  assessment: {
    verdict:
      | "excellent-typescript"
      | "ready-with-minor-improvements"
      | "async-correctness-concerns"
      | "type-design-concerns"
      | "module-boundary-concerns"
      | "significant-maintainability-concerns";
    risk: Risk;
    ship: boolean;
    summary: string;
    primaryConcern: string;
  };
  observations: ModelObservation[];
  strengths: Array<{ summary: string; evidenceIds: string[] }>;
}

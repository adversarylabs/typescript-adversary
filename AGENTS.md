# TypeScript adversary

This repository contains the first-party TypeScript adversary. It should review TypeScript like an experienced TypeScript engineer, not like a broad syntax linter.

## Principles

- Combine parser-backed deterministic facts with model engineering judgment.
- Prefer a few high-confidence findings that affect correctness, API quality, type/runtime alignment, or maintainability.
- Require concrete prepared evidence for model findings.
- Let the SDK synthesize, group, rank, and present findings.
- Leave HTTP, databases, frameworks, business logic, and general security to specialist adversaries.
- Never execute, install dependencies in, or modify the scanned repository.

## Validation

Run `npm test`, `npm audit --audit-level=high`, `adversary validate .`, and `adversary pack --check .`.

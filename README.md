# TypeScript adversary

Reviews TypeScript correctness, type design, async lifecycles, module boundaries, and runtime alignment.

## Goals

The adversary is designed to produce a small number of high-confidence,
actionable findings grounded in concrete repository evidence. Its review should
be deterministic where possible, explicit about impact, and quiet when the
available evidence does not justify a finding.

## Scope

It evaluates changed TypeScript code for type/runtime boundary alignment, strictness, exported API safety, suppression directives, and async lifecycle correctness.

The complete detector or review inventory is maintained in
[CHECKS.md](CHECKS.md).

## Boundaries

It owns framework- or language-specific review in this domain. Infrastructure, CI, dependency-manager, and unrelated application concerns remain with specialist adversaries.

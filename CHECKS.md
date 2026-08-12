# Checks — what typescript detects

This file is the **public audit list** of detectors for the **typescript** adversary. High-confidence type-safety escapes with file:line evidence — the places where TypeScript's guarantees are silently turned off. Not a style linter: no rules about enums vs unions, interface vs type, or naming. No rules are wired into `src/spec.ts` yet; this catalog is the implementation order.

Runtime source of truth: [`src/spec.ts`](src/spec.ts) / [`src/rules.ts`](src/rules.ts).

**Scope:** `tsconfig*.json` (root and nested — project references resolved), `*.ts`/`*.tsx` sources. Framework config escapes (Next.js `ignoreBuildErrors`) are owned by `nextjs`.

**Precision stance:** Config rules fire on explicit weakening, judged against the *effective* compiler options (extends-chains resolved), not file-local text. Cast rules are the FP minefield of this domain — they fire only at trust boundaries or in exported surface, never as a blanket `any` census. eslint/typescript-eslint defaults are not duplicated.

Public grounding: TypeScript handbook strictness docs, typescript-eslint guidance on `@ts-expect-error` vs `@ts-ignore`, and runtime-validation practice (zod/valibot) at process boundaries.

---

## High

### `typescript.boundary-cast`

| | |
| --- | --- |
| **What** | External data typed by assertion instead of validation |
| **Why** | `JSON.parse(body) as UserProfile` doesn't make it a UserProfile — it makes the compiler stop looking. Every field access after a boundary cast is trust in the network. This is where "TypeScript said it was fine" production incidents come from |
| **Looks for** | LLM-gated: `as T` / `<T>` assertions applied to `JSON.parse` results, `fetch`/axios response bodies, `req.body`/`req.query`, env vars, and message-queue payloads, with no runtime validation between |
| **Stays quiet when** | Schema validation at the boundary (zod/valibot/ajv/io-ts, generated clients with runtime checks); assertions on data the process itself just serialized; `as const` |
| **Public examples** | zod's own pitch is this exact gap; postmortems of shape-drift between services |
| **Remediation** | Parse, don't assert: validate external data with a schema library and derive the type from the schema |

---

## Medium

### `typescript.async.swallowed-awaited-rejection`

| | |
| --- | --- |
| **What** | An awaited operation converts rejection into success with an empty catch handler |
| **Why** | Readiness gates, assertions, and required work can fail while the enclosing async function continues as though the prerequisite succeeded |
| **Looks for** | LLM-gated: `await promise.catch(() => {})`, with surrounding lifecycle context |
| **Stays quiet when** | The handler logs, recovers, translates, or rethrows; the operation is clearly documented best-effort cleanup or teardown |
| **Public examples** | [Vite maintainer review](https://github.com/vitejs/vite/pull/23077#discussion_r3663113957) |
| **Remediation** | Let required failures reject, or implement an explicit recovery/fallback path |

### `typescript.strict-disabled`

| | |
| --- | --- |
| **What** | Strict type checking off or explicitly weakened |
| **Why** | Without `strict` (especially `strictNullChecks`/`noImplicitAny`) the compiler misses the exact bug classes people adopt TypeScript for. Widespread in legacy code, which is why this is medium with migration framing — not a gotcha |
| **Looks for** | Effective compiler options (extends resolved) with `strict` absent/false, or explicit `strictNullChecks: false` / `noImplicitAny: false` overrides — including nested tsconfigs weakening a strict root |
| **Stays quiet when** | `strict: true` effective; staged-migration configs where the weakening is scoped to a legacy sub-project *and* the root is strict (downgrade to low) |
| **Public examples** | TypeScript handbook strictness guidance; typescript-eslint recommended setup |
| **Remediation** | Enable `strict`; migrate incrementally per-directory with scoped configs rather than weakening globally |

### `typescript.ts-ignore`

| | |
| --- | --- |
| **What** | Compiler errors suppressed with `@ts-ignore` or bare `@ts-nocheck` |
| **Why** | `@ts-ignore` suppresses *whatever error happens to be there* — including new ones introduced later. `@ts-expect-error` at least fails when the error disappears. File-level `@ts-nocheck` turns checking off entirely |
| **Looks for** | `@ts-ignore` (prefer-expect-error parity); `@ts-nocheck` in non-generated files; either form with no explanatory description |
| **Stays quiet when** | `@ts-expect-error` with a description (the sanctioned escape hatch); generated files; declaration shims for untyped third-party modules |
| **Public examples** | typescript-eslint `ban-ts-comment` rationale; TS 3.9 release notes introducing `@ts-expect-error` for this reason |
| **Remediation** | Fix the type error; when suppression is genuinely needed, use `@ts-expect-error — <reason>` |

### `typescript.exported-any`

| | |
| --- | --- |
| **What** | `any` in exported API surface |
| **Why** | An `any` in an exported signature is contagious — it disables checking for every consumer, not just the file that took the shortcut. Internal `any` is a local debt; exported `any` is a public one |
| **Looks for** | Exported functions/classes/interfaces with `any` parameters, return types, or public fields; `as any` on exported constants |
| **Stays quiet when** | Internal/non-exported `any` (deliberately not a blanket census); `unknown` (the correct top type); constrained generics; declaration files wrapping genuinely untyped dependencies |
| **Public examples** | typescript-eslint `no-explicit-any` scoped rationale; API-drift bugs crossing package boundaries |
| **Remediation** | Type the public surface — `unknown` + narrowing where the shape is genuinely open |

### `typescript.double-cast`

| | |
| --- | --- |
| **What** | Type laundering via `as unknown as T` (or legacy `as any as T`) |
| **Why** | The double cast exists to defeat the compiler's overlap check — it asserts a conversion TypeScript concluded was impossible. Occasionally necessary, always worth a reviewer's eyes, never fine silently |
| **Looks for** | `as unknown as` / `as any as` chains outside test files |
| **Stays quiet when** | Test files building intentionally invalid fixtures; a comment justifying the conversion adjacent to the cast (downgrade to low, keep visible) |
| **Public examples** | TS assertion docs — the overlap rule this pattern bypasses |
| **Remediation** | Model the real relationship (type guards, discriminated unions, schema parse); if the cast is truly required, justify it in place |

---

## Out of scope (owned elsewhere)

| Concern | Owner |
| --- | --- |
| Runtime security sinks (eval, exec, TLS) | `nodejs` |
| React/Next.js specifics | `react` / `nextjs` |
| Build-time error suppression in Next config | `nextjs` (`build-errors-ignored`) |
| Complexity/design of TS code | `complexity` |
| Lint style (naming, imports, formatting) | eslint — deliberately not duplicated |

---

## Release gates (repo checklist)

- [ ] Hybrid deterministic and model review paths are covered
- [ ] Five calibration fixtures match expected review snapshots
- [ ] Root and nested TypeScript detection works
- [ ] Model input is bounded and evidence-linked
- [ ] Runtime artifact executes without `node_modules`
- [ ] `npm test`
- [ ] `npm audit --audit-level=high`
- [ ] `adversary validate .`
- [ ] `adversary pack --check .`

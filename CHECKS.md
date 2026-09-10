# Checks

| Rule | Severity | Scans for |
| --- | --- | --- |
| `typescript.async.async-promise-executor` | High | Promise uses an async executor |
| `typescript.async.ignored-foreach` | High | Async work is discarded by forEach |
| `typescript.async.swallowed-awaited-rejection` | Medium | An awaited operation converts rejection into success with an empty catch handler |
| `typescript.boundary-cast` | High | External data typed by assertion instead of validation |
| `typescript.double-cast` | Medium | Type laundering via `as unknown as T` (or legacy `as any as T`) |
| `typescript.exported-any` | Medium | `any` in exported API surface |
| `typescript.strict-disabled` | Medium | Strict type checking off or explicitly weakened |
| `typescript.ts-ignore` | Medium | Compiler errors suppressed with `@ts-ignore` or bare `@ts-nocheck` |

## Model-reviewed input conversion

The model traces lossy numeric conversion only when the prepared input contract, conversion, and downstream acceptance prove a wrong-value outcome. Intentional truncation, raw-input grammar validation, and rejection before effects stay quiet. A missing radix, a `number` annotation, or NaN rejected by validation is insufficient. See [calibration examples](docs/lossy-numeric-conversion.md).

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

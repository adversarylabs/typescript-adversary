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

## Miss-derived review boundary

- Check text-to-list empty-input handling: splitting a string on a nonempty string separator without a zero limit yields at least one element, including [''] for empty input. A subsequent length > 0 or length truthiness check cannot implement an empty-input fallback on that unfiltered result. Trace the string receiver, split options, intervening transformations, and consumer contract. Report only when source proves empty or whitespace-only entries violate an established representation or make an intended absent-value branch unreachable with a user-visible effect. Cite the conversion and downstream contract; do not assume blank entries are invalid in every list. Stay quiet for intentional empty fields, meaningful empty-string separators or zero limits, filtering before the check, raw-input guards, custom split methods, or downstream normalization that satisfies the contract.

The deterministic split signal is neutral prepared context, not a native-string or defect assertion. It inventories a const split result and its immediately following ternary/if length guard. Receiver semantics and downstream impact are model proof obligations, including for custom or unknown split methods. No finding is emitted from this signal alone.

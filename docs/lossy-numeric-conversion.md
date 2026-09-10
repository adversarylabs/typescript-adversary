# Lossy numeric conversion at an input boundary

## Positive calibration example

An input contract accepts numeric text including exponent notation. A handler calls `parseInt(raw, 10)` and forwards the result to a validator accepting finite numbers at least one. For `raw = "1e2"`, the handler supplies `1` instead of `100`; the numeric validator accepts that already-altered value. Likewise, a decimal representation can lose its fractional part. The review should cite the accepted input grammar, conversion, and downstream acceptance as one wrong-value defect.

A related case starts with a strict integer-text contract but converts `"12items"` to `12` before checking only that the result is an integer. The suffix has disappeared before validation. This is actionable only if the raw text is proven reachable and the contract rejects such suffixes.

## Clean counterexamples

- Raw input is validated against the required integer grammar before conversion, then finite/range checks enforce the output contract. Prefix parsing cannot silently consume an invalid suffix.
- The API explicitly promises truncation or integer-prefix extraction, and its consumer uses exactly that result. Do not impose full numeric parsing.
- A numeric input parser preserves exponent/decimal values, handles empty text separately, and validates finiteness, range, and any required integer constraint before use.
- Conversion produces NaN for empty text, but an existing validation boundary rejects it before the alleged persistence or execution effect. Do not claim a saved-data bug without another concrete consequence.
- A `number` annotation is the only evidence supplied. It does not specify whether exponent notation, decimals, or arbitrary text are accepted.

`parseInt("1e2", 10) === 1`; adding a radix does not fix that conversion. `Number("") === 0`, so blindly replacing the parser is not sufficient either. Require the repository's actual contract and prepared consumers rather than blanket parser bans.

These examples document JavaScript runtime behavior and rule boundaries. They do not measure live-model detection or benchmark recall. The runtime rule contains no benchmark identifiers or expected answers.

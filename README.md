# TypeScript adversary

`typescript` reviews TypeScript code as an experienced TypeScript engineer. It combines parser-backed observations with model reasoning to answer whether the implementation is correct, type-safe, maintainable, and honest about its runtime behavior.

Its authority includes async correctness, promise lifecycles, type-system quality, generics, discriminated unions, narrowing, module boundaries, public APIs, declaration quality, runtime/type mismatches, ESM/CommonJS behavior, package organization, and TypeScript-specific maintainability.

It deliberately leaves HTTP design, database correctness, framework practices, business logic, and general security to specialist adversaries.

## Development

```sh
npm ci
npm test
adversary validate .
adversary pack --check .
```

## Usage

Model credentials remain CLI configuration:

```sh
adversary run . --path ../target \
  --model-provider fireworks \
  --model accounts/fireworks/models/your-model-id
```

The adversary prepares bounded evidence and emits no more than four model observations. The SDK owns finding synthesis, grouping, ranking, suppression, and scope-aware opinion language.

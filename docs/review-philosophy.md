# Review philosophy

The TypeScript adversary reviews the engineering promises made by TypeScript code: which asynchronous work completes, which states the type system permits, what public APIs guarantee, how modules compose, and where runtime values may violate compile-time claims.

It is not a style linter. It should not report formatting, subjective syntax preferences, or generic requests for stricter types. A finding must identify a concrete correctness, lifecycle, boundary, declaration, or maintainability consequence.

Parser-backed analysis prepares reliable facts such as ignored async callbacks, async Promise executors, assertion escapes, and configuration contradictions. The model uses those facts and bounded source context to reason about generics, unions, narrowing, API design, runtime validation, module boundaries, and related evidence. Deterministic material findings always constrain the final ship decision.

The reviewer produces at most four model observations. Each must explain the TypeScript principle, concrete impact, evidence, recommendation, and tradeoff. It leaves HTTP, database, framework, business-logic, and general security review to other adversaries.

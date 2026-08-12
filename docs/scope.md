# lang/typescript — mission and scope

Source of truth for what this adversary is *for*.

- **Package:** `typescript`
- **Factory routing:** human PR comments are attributed to this adversary only when they match **In scope**.
- **Languages / surfaces:** TypeScript/JS

## Mission

Review TypeScript correctness, type design, async lifecycles, module boundaries, and runtime alignment.

## In scope (fair miss if humans raised it and we did not)

- Type design holes that cause real bugs
- Async lifecycle / unhandled rejections
- Awaited failures silently converted into success
- Module boundary mistakes
- Runtime vs type mismatch

## Out of scope (not a miss for this adversary)

- Pure CSS/style
- Go code
- CI workflows

## Factory grading rule

- **In scope + human raised it + this adversary did not surface it** → real miss → suggested issue for **this** package
- **Out of scope** → do not grade as a miss for this adversary
- **Better fit for another adversary** → route there; do not double-count as a miss here
- **Unclear** → prefer out-of-scope for grading

---
phase: 260325-jnb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types.ts
  - tests/helpers/console-spy.ts
  - tests/node/main/worker-e2e.test.ts
  - tests/node/main/worker-protocol.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "`npx tsc --noEmit` exits with code 0 (zero type errors)"
    - "No `any` is introduced anywhere"
  artifacts:
    - path: src/types.ts
      provides: "RootLogger interface with bypass() and restore() declared"
      contains: "bypass"
    - path: tests/helpers/console-spy.ts
      provides: "Type-safe console method override via double cast through unknown"
    - path: tests/node/main/worker-e2e.test.ts
      provides: "Type-safe RootLogger cast via unknown"
    - path: tests/node/main/worker-protocol.test.ts
      provides: "Type-safe RootLogger cast via unknown"
  key_links:
    - from: src/types.ts
      to: tests/node/main/console.test.ts
      via: "RootLogger.bypass / RootLogger.restore"
      pattern: "bypass|restore"
---

<objective>
Fix all 19 TypeScript type errors surfaced by `npx tsc --noEmit`.

Purpose: Strict-mode compliance — no `any`, correct interface declarations, no unsafe casts.
Output: Zero tsc errors across src/ and tests/.
</objective>

<context>
@src/types.ts
@tests/helpers/console-spy.ts
@tests/node/main/worker-e2e.test.ts
@tests/node/main/worker-protocol.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bypass() and restore() to RootLogger interface</name>
  <files>src/types.ts</files>
  <action>
    In `src/types.ts`, inside the `RootLogger` interface (after `unpatch(): void`), add the two missing method declarations that are already implemented in `src/logger/index.ts` via `createRootMixin`:

    ```ts
    /**
     * Redirects all logger output to `console` instead of the system console.
     * Call `restore()` to revert.
     */
    bypass(console: Console): void;
    /** Restores output back to the system console after a `bypass()` call. */
    restore(): void;
    ```

    The `Console` type is already available in the DOM lib (no import needed).
    This closes 11 errors in console.test.ts and registry.test.ts.
  </action>
  <verify>
    <automated>cd /workspaces/console && npx tsc --noEmit 2>&1 | grep "bypass\|restore"</automated>
  </verify>
  <done>No tsc errors mentioning bypass or restore.</done>
</task>

<task type="auto">
  <name>Task 2: Fix unsafe direct casts in test files (cast through unknown)</name>
  <files>
    tests/helpers/console-spy.ts,
    tests/node/main/worker-e2e.test.ts,
    tests/node/main/worker-protocol.test.ts
  </files>
  <action>
    TypeScript rejects direct casts between types that don't overlap when neither type
    has an index signature. The idiomatic fix is to cast through `unknown` first.

    **tests/helpers/console-spy.ts** (2 occurrences, lines ~38 and ~47):
    Replace every `(console as Record<string, unknown>)` with
    `(console as unknown as Record<string, unknown>)`.

    **tests/node/main/worker-e2e.test.ts** (line ~40):
    Replace `(WL as Record<string, unknown>)` with
    `(WL as unknown as Record<string, unknown>)`.

    **tests/node/main/worker-protocol.test.ts** (line ~110):
    Replace `(WL as Record<string, (...args: unknown[]) => void>)` with
    `(WL as unknown as Record<string, (...args: unknown[]) => void>)`.

    Do NOT introduce `any`. The double-cast `as unknown as X` is the correct
    strict-mode escape hatch when an index-based dynamic access is intentional.
  </action>
  <verify>
    <automated>cd /workspaces/console && npx tsc --noEmit 2>&1</automated>
  </verify>
  <done>`npx tsc --noEmit` produces no output and exits 0.</done>
</task>

</tasks>

<verification>
```bash
cd /workspaces/console && npx tsc --noEmit
echo "Exit: $?"
```
Expected: no output, exit code 0.
</verification>

<success_criteria>
- `npx tsc --noEmit` exits 0 with zero diagnostics.
- No `any` keyword added anywhere.
- The two method declarations in `RootLogger` match the implementation in `src/logger/index.ts`.
</success_criteria>

<output>
After completion, create `.planning/quick/260325-jnb-les-types-ne-sont-pas-bons-dans-les-test/260325-jnb-SUMMARY.md`
</output>

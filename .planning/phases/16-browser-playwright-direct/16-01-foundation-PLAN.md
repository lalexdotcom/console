---
phase: 16-browser-playwright-direct
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/common/output.ts
  - tests/common/adapter.ts
  - tests/common/suites/suite.ts
  - tests/common/suites/runner.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "tests/common/output.ts exports LogOutput interface with all 10 fields (raw, level?, scope?, msg?, date?, caller?, badgeColor?, icon?, progress?, spinnerState?)"
    - "TestAdapter.capture() return type is Promise<LogOutput[]> — string[] is gone"
    - "TestAdapter has parse(line: string): LogOutput | null — string[] capture is internally mapped"
    - "TestAdapter no longer has a logger property"
    - "TestCase has check(entries: LogOutput[]): void alongside run()"
    - "runner calls adapter.capture(() => tc.run(adapter)) then tc.check(entries) — run() is never called standalone"
  artifacts:
    - path: "tests/common/output.ts"
      provides: "LogOutput interface (the shared parse result type)"
      exports: ["LogOutput"]
    - path: "tests/common/adapter.ts"
      provides: "Updated TestAdapter interface"
      contains: "parse(line: string): LogOutput | null"
    - path: "tests/common/suites/suite.ts"
      provides: "Updated TestCase interface with check()"
      contains: "check(entries: LogOutput[]): void"
    - path: "tests/common/suites/runner.ts"
      provides: "runSuite() with new capture-then-check body"
  key_links:
    - from: "tests/common/suites/runner.ts"
      to: "tests/common/adapter.ts"
      via: "adapter.capture(() => tc.run(adapter)) — run() wrapped by capture"
      pattern: "adapter\\.capture.*tc\\.run"
    - from: "tests/common/suites/runner.ts"
      to: "tests/common/suites/suite.ts"
      via: "tc.check(entries) called with filtered LogOutput[]"
      pattern: "tc\\.check\\(entries"
---

<objective>
Lay the foundation for the parse-layer refactor: define the `LogOutput` type, update the
`TestAdapter` and `TestCase` contracts, and rewrite the runner to use capture-then-check.

Purpose: Every other plan in this phase depends on these four files. They must be done
first (Wave 1). After this plan the project will NOT compile — existing adapters still
return `string[]` and suites still lack `check`. That is the expected transient state.
Output: Four updated/created files that define the new contracts all adapters and suites
will implement against.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md

<interfaces>
<!-- Current interfaces the executor is replacing. Read before editing. -->

From tests/common/adapter.ts (CURRENT — will be replaced):
```ts
import type { RootLogger } from '../../src/types';

export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;  // ← becomes LogOutput[]
  readonly logger: RootLogger;  // ← REMOVED
}
```

From tests/common/suites/suite.ts (CURRENT — check() will be added):
```ts
export interface TestCase {
  name: string;
  parity?: boolean;
  run: (adapter: TestAdapter) => void | Promise<void>;
  // check is absent — will be added
}
```

From tests/common/suites/runner.ts (CURRENT runner body — will be rewritten):
```ts
test(tc.name, async () => {
  await tc.run(mainAdapter);
  if (tc.parity !== false && workerAdapter) {
    resetRegistry();
    await workerAdapter.setup();
    if (suite.setup) await suite.setup(workerAdapter);
    await tc.run(workerAdapter);
  }
});
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Define LogOutput, update TestAdapter and TestCase interfaces</name>
  <files>tests/common/output.ts, tests/common/adapter.ts, tests/common/suites/suite.ts</files>
  <read_first>
    - tests/common/adapter.ts — current interface (remove logger, change capture, add parse)
    - tests/common/suites/suite.ts — current TestCase (add check field)
    - .planning/phases/16-browser-playwright-direct/16-CONTEXT.md — locked field list for LogOutput
  </read_first>
  <action>
    1. CREATE tests/common/output.ts with the following exact LogOutput interface — no other exports:

    ```ts
    /**
     * Structured result produced by TestAdapter.parse() for one intercepted output line.
     * All fields except raw are optional — parse() fills only what the format provides.
     */
    export interface LogOutput {
      raw: string;
      level?: string;
      scope?: string;
      msg?: string;
      date?: string;
      caller?: string;
      badgeColor?: string;
      icon?: string;
      progress?: number;
      spinnerState?: 'running' | 'success' | 'fail' | 'stop';
    }
    ```

    2. EDIT tests/common/adapter.ts:
       - Remove `import type { RootLogger }` — it will no longer be used here
       - Add `import type { LogOutput } from './output'`
       - Change capture return type: `Promise<string[]>` → `Promise<LogOutput[]>`
       - Add `parse(line: string): LogOutput | null` to the interface
       - Remove `readonly logger: RootLogger` from the interface
       - Update the JSDoc: remove the @param logger line, add @param parse description

    3. EDIT tests/common/suites/suite.ts:
       - Add `import type { LogOutput } from '../output'`
       - Add `check(entries: LogOutput[]): void` to TestCase (after run, before closing brace)
       - Keep RunTestFunction type alias and Suite interface unchanged
       - Update TestCase JSDoc to describe check
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "output.ts\|adapter.ts\|suite.ts" | head -20</verify>
  <acceptance_criteria>
    - tests/common/output.ts exists and exports exactly the LogOutput interface
    - TestAdapter.capture signature is Promise&lt;LogOutput[]&gt; in adapter.ts
    - TestAdapter has parse(line: string): LogOutput | null
    - TestAdapter has no logger property
    - TestCase has check(entries: LogOutput[]): void
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Rewrite runner.ts to capture-then-check pattern</name>
  <files>tests/common/suites/runner.ts</files>
  <read_first>
    - tests/common/suites/runner.ts — full current file to understand exact structure before editing
    - tests/common/suites/suite.ts — new TestCase shape (check field)
    - tests/common/adapter.ts — new capture signature
  </read_first>
  <action>
    EDIT tests/common/suites/runner.ts — replace the test() body inside the for loop with
    the new capture-then-check pattern. Keep all other runner structure (describe, beforeEach,
    parity adapter setup) unchanged.

    Replace THIS current test body:
    ```ts
    test(tc.name, async () => {
      await tc.run(mainAdapter);
      if (tc.parity !== false && workerAdapter) {
        resetRegistry();
        await workerAdapter.setup();
        if (suite.setup) await suite.setup(workerAdapter);
        await tc.run(workerAdapter);
      }
    });
    ```

    WITH:
    ```ts
    test(tc.name, async () => {
      const entries = await mainAdapter.capture(() => tc.run(mainAdapter));
      tc.check(entries);

      if (tc.parity !== false && workerAdapter) {
        resetRegistry();
        await workerAdapter.setup();
        if (suite.setup) await suite.setup(workerAdapter);
        const entriesW = await workerAdapter.capture(() => tc.run(workerAdapter));
        tc.check(entriesW);
      }
    });
    ```

    Key points:
    - tc.run() is NEVER called standalone — it is always the fn argument to capture()
    - tc.check() is called after each capture() with the returned LogOutput[]
    - The parity re-run structure remains: resetRegistry → workerAdapter.setup() → suite.setup?() → capture → check
    - No other changes to the file
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "runner.ts" | head -10</verify>
  <acceptance_criteria>
    - runner.ts calls adapter.capture(() => tc.run(adapter)) for both main and worker adapters
    - tc.check(entries) is called after each capture()
    - tc.run() is never called directly (only inside the capture arrow fn)
    - Parity re-run still resets registry and re-runs suite.setup
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# 1. Confirm output.ts exists and has the right exports
grep -n "export interface LogOutput" tests/common/output.ts

# 2. Confirm parse() is in TestAdapter
grep -n "parse" tests/common/adapter.ts

# 3. Confirm logger is gone from TestAdapter
grep -n "logger" tests/common/adapter.ts && echo "FAIL: logger still present" || echo "OK: logger removed"

# 4. Confirm check() is in TestCase
grep -n "check" tests/common/suites/suite.ts

# 5. Confirm runner uses new pattern
grep -n "adapter.capture\|tc.check" tests/common/suites/runner.ts
```

Expected: compile errors from suites and adapters that haven't been migrated yet — this is
the expected transient state at end of wave 1.

## Success Criteria

- `tests/common/output.ts` exists and exports `LogOutput`
- `TestAdapter` has `parse()` and `capture(): Promise<LogOutput[]>`, no `logger`
- `TestCase` has `check(entries: LogOutput[]): void`
- `runner.ts` uses `adapter.capture(() => tc.run(adapter))` → `tc.check(entries)` pattern
- No regressions in non-suite tests (registry.test.ts, console.test.ts) — they don't use runSuite()

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-01-foundation-SUMMARY.md`
</output>

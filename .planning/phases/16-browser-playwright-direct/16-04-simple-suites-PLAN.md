---
phase: 16-browser-playwright-direct
plan: "04"
type: execute
wave: 3
depends_on:
  - "16-02"
  - "16-03"
files_modified:
  - tests/common/suites/levels.suite.ts
  - tests/common/suites/scopes.suite.ts
  - tests/common/suites/options.suite.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "levels suite: every TestCase has check(entries) with count assertions; run() contains only log call stimulus"
    - "scopes suite: structural-only TestCases have check: () => {} no-op; run() keeps its API assertions"
    - "options suite: structural tests keep assertions in run() with check: () => {}; capture tests move assertions to check()"
    - "No TestCase in any of the three suites calls adapter.capture() inside run()"
  artifacts:
    - path: "tests/common/suites/levels.suite.ts"
      provides: "migrated levels suite — all 11+ TestCases have check()"
    - path: "tests/common/suites/scopes.suite.ts"
      provides: "migrated scopes suite — structural tests with check: () => {}"
    - path: "tests/common/suites/options.suite.ts"
      provides: "migrated options suite — mix of check: () => {} and check(entries)"
  key_links:
    - from: "tests/common/suites/levels.suite.ts"
      to: "tests/common/suites/suite.ts"
      via: "TestCase.check(entries: LogOutput[]): void — entries count assertions"
      pattern: "check\\(entries"
    - from: "tests/common/suites/options.suite.ts"
      to: "tests/common/suites/suite.ts"
      via: "TestCase.check with no-op or field assertions depending on whether test captures output"
      pattern: "check:"
---

<objective>
Migrate the three simplest suites (levels, scopes, options) to the split run()/check()
pattern.

Purpose: These suites are the lowest-risk starting point. levels is the reference
implementation pattern. scopes has mostly structural tests (no output). options has a
mix of both.
Output: Three suite files where every TestCase has check(), run() contains only stimulus,
and no adapter.capture() calls appear inside run().
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md
@.planning/phases/16-browser-playwright-direct/16-01-foundation-SUMMARY.md

<interfaces>
<!-- Updated TestCase contract (from plan 01) -->
```ts
import type { LogOutput } from '../output';

export interface TestCase {
  name: string;
  parity?: boolean;
  run: (adapter: TestAdapter) => void | Promise<void>;   // stimulus only
  check: (entries: LogOutput[]) => void;                  // assertions only
}
```

<!-- Migration pattern — levels suite reference example:

BEFORE:
  {
    name: 'emerg emits exactly one line',
    run: async (adapter) => {
      const lines = await adapter.capture(() => {
        (L as any)['emerg']('msg');
      });
      expect(lines).toHaveLength(1);
    },
  }

AFTER:
  {
    name: 'emerg emits exactly one line',
    run(_adapter) {
      (L as any)['emerg']('msg');
    },
    check(entries) {
      expect(entries).toHaveLength(1);
    },
  }

For structural (no-output) tests:
  {
    name: 'L.scope() returns a ScopeLogger',
    run(_adapter) {
      const s = L.scope('scope-01');
      expect(s.scope).toBe('scope-01');  // structural assertion stays here
    },
    check: () => {},  // no-op — no output to inspect
  }
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate levels.suite.ts and scopes.suite.ts</name>
  <files>tests/common/suites/levels.suite.ts, tests/common/suites/scopes.suite.ts</files>
  <read_first>
    - tests/common/suites/levels.suite.ts — full file (11 level tests + CORE-02/03 filtering tests)
    - tests/common/suites/scopes.suite.ts — full file (understand which tests capture output, which are structural)
    - tests/common/suites/suite.ts — new TestCase interface for TypeScript type reference
  </read_first>
  <action>
    EDIT tests/common/suites/levels.suite.ts:

    Add `import type { LogOutput } from '../../common/output'` (or `'../output'` — resolve
    relative path from suite file location).

    For EVERY TestCase in the suite, apply the pattern:
      - Remove `const lines = await adapter.capture(() => { ... })` wrapper
      - Move the log call(s) directly into run() body (they were inside the arrow fn)
      - Move all `expect(lines...)` assertions into check(entries)
      - Replace `lines` with `entries` in assertions

    The CORE-01 tests each emit exactly one line:
    ```ts
    {
      name: 'emerg emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg']('msg');
      },
      check(entries) {
        expect(entries).toHaveLength(1);
      },
    },
    ```

    For CORE-02 (level filtering) and CORE-03 (enabled toggle) tests the same pattern
    applies — move log calls to run(), count assertions to check().

    The setup function (`L.format = 'json'`) remains on the Suite object — it is not changed.

    EDIT tests/common/suites/scopes.suite.ts:

    Read all test cases. Classify each:
    - If it calls `adapter.capture()` internally: split into run() (stimulus) + check() (assertions)
    - If it uses only API assertions (expect on return values, property checks): keep all in
      run() and add `check: () => {}` no-op

    Add `import type { LogOutput } from '../../common/output'` or appropriate relative path.

    Typical scopes pattern (structural — keep in run):
    ```ts
    {
      name: 'L.scope() returns a ScopeLogger with scope and all level methods',
      run(_adapter) {
        const s = L.scope('scope-01-api');
        expect(s.scope).toBe('scope-01-api');
        for (const name of ['emerg','alert','crit','error','warn','info','debug','trace','wth']) {
          expect(typeof (s as any)[name]).toBe('function');
        }
      },
      check: () => {},
    },
    ```
  </action>
  <verify>
    pnpm run test -- --project node 2>&1 | grep -E "levels|scopes|FAIL|PASS" | head -30
  </verify>
  <acceptance_criteria>
    - Every TestCase in levels.suite.ts has a check() method (not just run())
    - No adapter.capture() calls appear inside any run() in levels.suite.ts
    - Every TestCase in scopes.suite.ts has check() — either assertions or no-op () => {}
    - No adapter.capture() inside any run() in scopes.suite.ts
    - pnpm test passes for all levels and scopes test cases (node project)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Migrate options.suite.ts (mix of structural and capture tests)</name>
  <files>tests/common/suites/options.suite.ts</files>
  <read_first>
    - tests/common/suites/options.suite.ts — full file (understand which tests use capture)
    - tests/common/suites/suite.ts — TestCase interface
  </read_first>
  <action>
    EDIT tests/common/suites/options.suite.ts:

    Add `import type { LogOutput } from '../../common/output'` (adjust relative path).

    Classify each TestCase:

    OPT-01 — getter/setter tests (enabled, level, pad, color, date, stack, uid, inspect):
    Most of these are purely structural (no log output captured). Pattern:
    ```ts
    {
      name: 'enabled: default=true, setter/getter round-trip',
      run(_adapter) {
        expect(L.enabled).toBe(true);
        L.enabled = false;
        expect(L.enabled).toBe(false);
        L.enabled = true;
      },
      check: () => {},
    },
    ```

    OPT-02 — cascade tests (some may capture output):
    If a test calls `adapter.capture()` internally to verify output format changes,
    move log calls to run() and field assertions to check().

    OPT-03 — level cascade tests: typically structural (compare L.level vs scope level).
    Keep assertions in run(), use `check: () => {}`.

    OPT-04 — util.inspect tests: these DO capture output to verify inspect option is
    forwarded. Apply the split pattern for these:
    - run(): log call with inspect option
    - check(entries): `expect(entries[0].msg).toContain(...)` or `expect(entries[0].raw).toContain(...)`

    There is also an adapter guard for OPT-01/OPT-04: `if (adapter.name.startsWith('browser')) return;`
    This guard stays in run() — run() still receives the adapter parameter.

    Any inline `adapter.capture()` inside run() must be removed; the log call(s) become
    the direct body of run().
  </action>
  <verify>
    pnpm run test -- --project node 2>&1 | grep -E "options|FAIL|PASS" | head -30
  </verify>
  <acceptance_criteria>
    - Every TestCase in options.suite.ts has check() — either () => {} or with assertions
    - No adapter.capture() inside any run()
    - OPT-04 util.inspect test has log call in run() and string-contain assertion in check()
    - Adapter.name browser guards remain inside run()
    - pnpm test passes for all options test cases (node project)
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# No adapter.capture calls inside any run() body in these suites
grep -n "adapter\.capture" \
  tests/common/suites/levels.suite.ts \
  tests/common/suites/scopes.suite.ts \
  tests/common/suites/options.suite.ts \
  && echo "FAIL: adapter.capture found in run()" || echo "OK"

# Every TestCase has check property
grep -c "check" \
  tests/common/suites/levels.suite.ts \
  tests/common/suites/scopes.suite.ts \
  tests/common/suites/options.suite.ts

# Run node tests — should pass for levels/scopes/options
pnpm run test -- --project node 2>&1 | tail -20
```

## Success Criteria

- Three suites migrated: levels, scopes, options
- No `adapter.capture()` inside `run()` in any of the three files
- Every TestCase has `check(entries: LogOutput[]): void` or `check: () => {}`
- All level, scope, option tests pass with `pnpm run test --project node`

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-04-simple-suites-SUMMARY.md`
</output>

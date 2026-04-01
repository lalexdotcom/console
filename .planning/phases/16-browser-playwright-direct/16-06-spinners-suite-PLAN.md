---
phase: 16-browser-playwright-direct
plan: "06"
type: execute
wave: 4
depends_on:
  - "16-04"
  - "16-05"
files_modified:
  - tests/common/suites/spinners.suite.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "spinners suite run() contains only log calls and timer operations — no adapter.capture() calls"
    - "rs.useFakeTimers() and rs.useRealTimers() both live inside run() (before capture's fn returns)"
    - "Multi-capture tests are restructured: all stimulus phases in one run(), assertions on total entries in check()"
    - "getRunningIcon(adapter) and getTickAdvance(adapter) helpers still called inside run(), which still receives adapter"
    - "check() uses entries[0].spinnerState, entries[0].icon instead of lines.includes(char)"
    - "All SPIN-01 through SPIN-06 and SPIN-08 tests pass in both node and browser projects"
  artifacts:
    - path: "tests/common/suites/spinners.suite.ts"
      provides: "migrated spinners suite — all TestCases have run() / check() pattern"
      contains: "spinnerState"
  key_links:
    - from: "tests/common/suites/spinners.suite.ts (run)"
      to: "tests/common/suites/runner.ts"
      via: "run() is fn argument to adapter.capture() — rs.useFakeTimers() must finish before capture resolves"
      pattern: "rs\\.useRealTimers\\(\\).*inside run"
    - from: "tests/common/suites/spinners.suite.ts (check)"
      to: "tests/common/output.ts"
      via: "spinnerState, icon fields used in assertions instead of raw string contains"
      pattern: "entries.*spinnerState"
---

<objective>
Migrate the spinners suite — the most complex suite in the codebase — to the run()/check()
pattern, restructuring multi-capture sequences and fake timer flows.

Purpose: spinners.suite.ts is the last suite and is intentionally isolated to wave 4 so
the executor can reference patterns already working in plans 04–05. The key challenges
are: fake timers inside run(), cross-capture spinner refs, and adapter-specific icon values.
Output: spinners.suite.ts fully migrated — every TestCase has check(), no adapter.capture()
inside run(), all spinner tests pass in node and browser.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md
@.planning/phases/16-browser-playwright-direct/16-04-simple-suites-SUMMARY.md
@.planning/phases/16-browser-playwright-direct/16-05-medium-suites-SUMMARY.md

<interfaces>
<!-- TestCase contract (plan 01) -->
```ts
export interface TestCase {
  name: string;
  parity?: boolean;
  run: (adapter: TestAdapter) => void | Promise<void>;   // stimulus only
  check: (entries: LogOutput[]) => void;                  // no async — synchronous
}
```

<!-- CRITICAL: Fake timer pattern AFTER migration.
  run() IS the fn inside adapter.capture(). useFakeTimers() and
  useRealTimers() must both be INSIDE run():

  BEFORE:
    run: async (adapter) => {
      const lines = await adapter.capture(() => {
        rs.useFakeTimers();
        L.scope('spin').info.spin('loading');
        rs.advanceTimersByTime(TICK_ADVANCE);
      });
      rs.useRealTimers();  // ← OUTSIDE capture
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }

  AFTER:
    run(adapter) {
      rs.useFakeTimers();
      L.scope('spin').info.spin('loading');
      rs.advanceTimersByTime(getTickAdvance(adapter));
      rs.useRealTimers();  // ← INSIDE run (which is inside capture's fn)
    },
    check(entries) {
      expect(entries.length).toBeGreaterThanOrEqual(2);
    },
-->

<!-- CRITICAL: Multi-capture restructuring.
  Tests that used multiple adapter.capture() calls to isolate phases must merge all
  phases into one run(). The spinner lifecycle guarantees deterministic output:
    - start() always emits exactly 1 running frame
    - stop() always emits 0 additional lines
    - success/fail after terminal state always emit 0 additional lines

  BEFORE (multi-capture — stop test):
    let sp!: LoggerSpinner;
    await adapter.capture(() => { sp = L.scope('spin-01-stop').info.spin('task'); });
    const lines = await adapter.capture(() => { sp.stop(); });
    expect(lines).toHaveLength(0);

  AFTER (merged — total entries = 1 from start; stop adds nothing):
    run(_adapter) {
      const sp = L.scope('spin-01-stop').info.spin('task');
      sp.stop();
    },
    check(entries) {
      // start emits 1 frame; stop adds 0 → total = 1
      expect(entries).toHaveLength(1);
      expect(entries[0].spinnerState).toBe('running');
    },
-->

<!-- CRITICAL: Icon vs spinnerState assertions.
  OLD: expect(lines[0]).toContain('✔')
  NEW: expect(entries[0].spinnerState).toBe('success')
       OR: expect(entries.some((e) => e.spinnerState === 'success')).toBe(true)

  OLD: expect(lines[0]).toContain(RUNNING_ICON)  (adapter-specific char)
  NEW: expect(entries[0].spinnerState).toBe('running')
       (parse() normalizes both '⋯' and '-' to spinnerState = 'running')
-->

<!-- CRITICAL: adapter.name guard for browser-skip tests.
  run() still receives adapter — guards like `if (adapter.name.startsWith('browser')) return;`
  stay in run(). check(entries) handles empty entries: `if (entries.length === 0) return;`
-->

<!-- SPIN-02 idempotency test — success/fail after stop:
  BEFORE:
    let sp!: LoggerSpinner;
    await adapter.capture(() => { sp = ...; sp.stop(); });
    const s1 = await adapter.capture(() => { sp.success(); });
    const s2 = await adapter.capture(() => { sp.fail(); });
    expect(s1).toHaveLength(0);
    expect(s2).toHaveLength(0);

  AFTER:
    run(_adapter) {
      const sp = L.scope('spin-02-after-stop').info.spin('task');
      sp.stop();
      sp.success();  // terminal — no output
      sp.fail();     // terminal — no output
    },
    check(entries) {
      // Only the initial start frame; stop/success/fail all add 0
      expect(entries).toHaveLength(1);
    },
-->

<!-- SPIN-03 autoStart: false — explicit start test (two phases):
  BEFORE:
    const beforeStart = await adapter.capture(() => { spinner = ...; })
    expect(beforeStart).toHaveLength(0);
    const afterStart = await adapter.capture(() => { spinner.start(); });
    expect(afterStart.length).toBeGreaterThanOrEqual(1);

  AFTER:
    run(adapter) {
      const { RUNNING_ICON } = ...; // or use spinnerState
      const scope = L.scope('spin-03-explicit-start');
      scope.info.spin('loading', { autoStart: false });  // no start → 0 frames so far
      // Now start: this emits 1 frame — captured in same run()
      // But wait: the spinner ref is not kept across two separate sections...
      // Solution: declare spinner var, call start() in same run():
      const spinner = scope.info.spin('loading', { autoStart: false });
      spinner.start();  // auto-capture: 0 from construction + 1 from start
    },
    check(entries) {
      // autoStart:false construction emits 0; start() emits ≥1
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].spinnerState).toBe('running');
    },

  NOTE: The intermediate "beforeStart should have 0 entries" check CANNOT be replicated
  in the merged model (there is only one capture for the whole run). The essential
  behaviour is still verified: autoStart:false + explicit start → entries ≥ 1. The
  intermediate state (construction emits nothing) is implicitly guaranteed by the
  spinner implementation and tested in the "autoStart:false emits zero" sibling test.
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate spinners.suite.ts — all SPIN-01/02/03/04/05/06/08 tests</name>
  <files>tests/common/suites/spinners.suite.ts</files>
  <read_first>
    - tests/common/suites/spinners.suite.ts — FULL file (read every test case before editing)
    - .planning/phases/16-browser-playwright-direct/16-RESEARCH.md — spinners section (multi-capture, fake timer patterns)
    - tests/common/suites/suite.ts — TestCase interface
    - tests/common/suites/levels.suite.ts — reference migrated pattern (from plan 04)
  </read_first>
  <action>
    EDIT tests/common/suites/spinners.suite.ts.

    Read the entire file first. Identify every TestCase. For each, apply the rules below.

    Add `import type { LogOutput } from '../output'` (adjust relative path).

    === RULE 1: Single-capture tests (most tests) ===
    Pattern: `const lines = await adapter.capture(() => { [stimulus] })` — split:
    - run(): [stimulus] moved directly here (no capture wrapper)
    - check(entries): assertions moved here

    === RULE 2: Fake timer tests ===
    rs.useFakeTimers() goes at TOP of run().
    rs.advanceTimersByTime(...) stays inside run().
    rs.useRealTimers() goes at BOTTOM of run() (before run() returns).
    check() gets count/state assertions.

    === RULE 3: Multi-capture tests (merge all phases) ===
    All spinner refs created within run() — no variable crosses capture boundaries.
    Total entry count covers ALL phases combined.
    Terminal state lifecycle:
      start → emits 1 running frame
      stop/success/fail after terminal → emits 0

    === RULE 4: Icon assertions ===
    Replace `lines[0].contains(RUNNING_ICON)` with `entries[0].spinnerState === 'running'`
    Replace `lines.some((l) => l.includes('✔'))` with `entries.some(e => e.spinnerState === 'success')`
    Replace `lines.some((l) => l.includes('✖'))` with `entries.some(e => e.spinnerState === 'fail')`

    === RULE 5: Raw text assertions ===
    Replace `lines.some((l) => l.includes('[ ⋯ ]'))` with:
      `entries.some(e => e.raw.includes('[ ⋯ ]'))` — raw field holds the original line

    Replace `lines.every(l => !l.includes('\x1b[?25l'))` with:
      `entries.every(e => !e.raw.includes('\x1b[?25l'))`

    === RULE 6: exec() tests ===
    exec() is async. The adapter captures output while the promise resolves. Pattern:
    ```ts
    run: async (_adapter) => {
      await L.scope('spin-04-ok').info.exec(Promise.resolve('result'), { label: 'Task' });
    },
    check(entries) {
      expect(entries.some((e) => e.spinnerState === 'success')).toBe(true);
    },
    ```
    For the rejected-promise exec test, `threw` variable:
    ```ts
    run: async (_adapter) => {
      try {
        await L.scope('spin-04-fail').info.exec(
          Promise.reject(new Error('boom')),
          { label: 'Task' },
        );
      } catch {
        // exec() re-throws — expected; captured in check via entries
      }
    },
    check(entries) {
      expect(entries.some((e) => e.spinnerState === 'fail')).toBe(true);
    },
    ```
    NOTE: The original `threw = true` assertion moves OUT of check() since check() has
    no closure over run()'s local scope. The thrown-and-caught nature is verified by
    the fail icon appearing in entries (the emit only happens if exec internally called
    sp.fail() before rethrowing). If the rethrow behaviour is critical to validate, add
    a try/catch in run() with a side effect on a module-level flag (but prefer the
    icon-based assertion as it is simpler and still validates exec() called sp.fail()).

    === RULE 7: Duration text (SPIN-05) ===
    Duration suffix appears in the raw line:
    `expect(entries.some((e) => /\+\d+(ms|s)/.test(e.raw))).toBe(true)`

    === RULE 8: Progress (SPIN-06) ===
    Progress indicators in raw line:
    `expect(entries.some((e) => e.raw.includes('●') || e.raw.includes('%'))).toBe(true)`

    === RULE 9: adapter.name browser guards ===
    Keep `if (adapter.name.startsWith('browser')) return;` inside run().
    In check(): `if (entries.length === 0) return;` to handle the early-return case.

    After editing, confirm: ZERO calls to adapter.capture() remain anywhere in run().
  </action>
  <verify>
    # No adapter.capture inside spinners suite
    grep -n "adapter\.capture" tests/common/suites/spinners.suite.ts \
      && echo "FAIL" || echo "OK"

    # Run full test suite
    pnpm run test 2>&1 | tail -30
  </verify>
  <acceptance_criteria>
    - No adapter.capture() call inside any run() in spinners.suite.ts
    - rs.useFakeTimers() and rs.useRealTimers() both appear inside run()
    - Multi-capture tests (stop, success-twice, fail-after-stop, autoStart:false explicit start) merged into single run()
    - Icon/state assertions use entries[].spinnerState or entries[].raw — not RUNNING_ICON string compare
    - pnpm run test passes for ALL projects (node + browser) — all spinner tests green
    - getRunningIcon(adapter) and getTickAdvance(adapter) still called inside run(adapter)
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# 1. No adapter.capture in run() — final check
grep -n "adapter\.capture" tests/common/suites/spinners.suite.ts \
  && echo "FAIL: adapter.capture in run()" || echo "OK"

# 2. Both fake timer calls are inside run (not at module level)
grep -n "useRealTimers\|useFakeTimers" tests/common/suites/spinners.suite.ts

# 3. check() exists on every test case
grep -c "check(" tests/common/suites/spinners.suite.ts

# 4. Full test suite — all projects
pnpm run test 2>&1 | tail -40

# 5. TypeScript compilation zero errors
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v "error TS" | head -5
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "error TS" | wc -l
```

## Success Criteria

- spinners.suite.ts fully migrated: every TestCase has `run()` (stimulus) + `check()` (assertions)
- fake timer lifecycle: `rs.useFakeTimers()` at top of `run()`, `rs.useRealTimers()` at bottom of `run()`
- multi-capture tests merged: stop/success-idempotency/autoStart:false sequences work as single `run()`
- assertions use `entries[N].spinnerState` and `entries[N].raw` — no raw icon string comparisons
- `pnpm run test` exits 0 with all spinner, levels, prefix, formats, mixins, options, scopes tests passing
- `npx tsc --noEmit` exits 0 (zero TypeScript errors)

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-06-spinners-suite-SUMMARY.md`
</output>

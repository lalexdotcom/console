---
phase: 16-browser-playwright-direct
plan: "05"
type: execute
wave: 3
depends_on:
  - "16-02"
  - "16-03"
files_modified:
  - tests/common/suites/mixins.suite.ts
  - tests/common/suites/prefix.suite.ts
  - tests/console/formats.suite.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "mixins suite MIX-03 explicit-key test works with merged run() — separate captures collapsed into one stimulus"
    - "prefix suite run() contains only log calls (and browser guards); badge/content assertions are in check(entries)"
    - "formats suite removes all inline JSON.parse() and parseLogfmt() calls — assertions use LogOutput fields instead"
    - "formats suite removes toMatchInlineSnapshot() calls — replaced with LogOutput field-level assertions"
    - "No adapter.capture() inside any run() in any of the three suites"
  artifacts:
    - path: "tests/common/suites/mixins.suite.ts"
      provides: "migrated mixins suite — once/limit/options with check()"
    - path: "tests/common/suites/prefix.suite.ts"
      provides: "migrated prefix suite — badge/date/caller/scope tests with check(entries)"
    - path: "tests/console/formats.suite.ts"
      provides: "migrated formats suite — JSON/logfmt/pretty assertions via LogOutput fields"
  key_links:
    - from: "tests/common/suites/mixins.suite.ts"
      to: "tests/common/suites/suite.ts"
      via: "check(entries) counts lines dropped by once()/limit()"
      pattern: "entries.*toHaveLength"
    - from: "tests/console/formats.suite.ts"
      to: "tests/common/output.ts"
      via: "entries[0].level / entries[0].msg used instead of JSON.parse(lines[0])"
      pattern: "entries\\[0\\]\\.level"
---

<objective>
Migrate three medium-complexity suites (mixins, prefix, formats) to the run()/check()
pattern.

Purpose: mixins has multi-capture tests to merge; prefix has inline adapter.capture()
calls per test; formats uses inline JSON.parse and toMatchInlineSnapshot — all three
require more than a mechanical run→check split.
Output: Three suites fully migrated, no adapter.capture() inside run(), assertions use
LogOutput fields.
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
<!-- TestCase shape (plan 01) -->
```ts
export interface TestCase {
  name: string;
  parity?: boolean;
  run: (adapter: TestAdapter) => void | Promise<void>;   // stimulus only
  check: (entries: LogOutput[]) => void;                  // assertions on parsed output
}
```

<!-- mixins MIX-03 key insight:
  The three separate adapter.capture() calls in the explicit-key test were a workaround
  to simulate different call-site source lines. But the explicit key bypasses call-site
  derivation entirely — all calls share the explicit key regardless of source line.
  Merging into one run() works correctly:

  BEFORE (3 separate captures → 3 cross-capture assertions):
    const out1 = await adapter.capture(() => { s.limit(2, key).info('first'); });
    const out2 = await adapter.capture(() => { s.limit(2, key).info('second'); });
    const out3 = await adapter.capture(() => { s.limit(2, key).info('third'); });
    expect(out1).toHaveLength(1);
    expect(out2).toHaveLength(1);
    expect(out3).toHaveLength(0); // limit=2 hit after first two

  AFTER (merged — same logical result, max=2 so first 2 emit, third is dropped):
    run(_adapter) {
      s.limit(2, key).info('first');
      s.limit(2, key).info('second');
      s.limit(2, key).info('third');
    },
    check(entries) {
      expect(entries).toHaveLength(2);
    },
-->

<!-- formats suite — key migration rules:
  1. Replace `JSON.parse(lines[0].trimEnd()) as Record<string,unknown>` with `entries[0]`
     (LogOutput.level, .msg, .date, .scope etc.)
  2. Replace `parseLogfmt(lines[0])` with `entries[0]` (same fields)
  3. Replace `toMatchInlineSnapshot(...)` with explicit field assertions:
       entries[0].level === expected_level
       entries[0].msg === expected_msg
  4. L.format = 'json' / 'logfmt' / 'pretty' calls inside run() are fine — stimulus side-effects.
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate mixins.suite.ts and prefix.suite.ts</name>
  <files>tests/common/suites/mixins.suite.ts, tests/common/suites/prefix.suite.ts</files>
  <read_first>
    - tests/common/suites/mixins.suite.ts — full file (all 4 MIX tests, including MIX-03 multi-capture)
    - tests/common/suites/prefix.suite.ts — full file (all 11 level badge tests + date/caller/scope)
    - tests/common/suites/suite.ts — TestCase interface
  </read_first>
  <action>
    EDIT tests/common/suites/mixins.suite.ts:

    Add `import type { LogOutput } from '../../common/output'` (adjust path).

    MIX-01 (once — single capture, count check):
    ```ts
    {
      name: 'once() called in a loop emits exactly once regardless of call count',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-once-loop');
        for (let i = 0; i < 5; i++) {
          s.once().info('msg');
        }
      },
      check(entries) {
        expect(entries).toHaveLength(1);
      },
    },
    ```

    MIX-02 (limit — single capture, count check):
    ```ts
    {
      name: 'limit(3) called 10 times emits exactly 3 times',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-limit-basic');
        for (let i = 0; i < 10; i++) {
          s.limit(3).info('msg');
        }
      },
      check(entries) {
        expect(entries).toHaveLength(3);
      },
    },
    ```

    MIX-03 (explicit key — merge the 3 separate captures into one run):
    The 3 separate adapter.capture() calls collapse into 3 sequential log calls.
    Max=2 shared by explicit key → first 2 emit, third is dropped.
    ```ts
    {
      name: 'explicit key groups calls from different lines under one shared counter',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-limit-key');
        const key = 'shared-counter';
        s.limit(2, key).info('first');
        s.limit(2, key).info('second');
        s.limit(2, key).info('third');  // dropped: counter at max
      },
      check(entries) {
        expect(entries).toHaveLength(2);
      },
    },
    ```

    MIX-04 (options one-shot override — captures output):
    Move the log call to run(), add check(entries) for any field assertions.

    EDIT tests/common/suites/prefix.suite.ts:

    Add `import type { LogOutput } from '../../common/output'`.

    PREFIX-01 (11 badge tests + date/caller/scope):
    Each test currently calls `adapter.capture()` inline. Apply the split:

    ```ts
    {
      name: 'emerg badge shows [EMERGENCY]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        L.color = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg']('x');
      },
      check(entries) {
        if (entries.length === 0) return;  // browser adapter skipped in run()
        expect(entries[0].level).toBe('emerg');
        // The raw line still contains the badge text for adapters that parse it
        expect(entries[0].raw).toContain('[EMERGENCY]');
      },
    },
    ```

    For the browser-guard check: if run() returns early (browser), entries will be empty.
    check(entries) should guard `if (entries.length === 0) return;` rather than duplicating
    the `adapter.name.startsWith('browser')` check (which check() doesn't have access to).

    PREFIX-02 (date prefix — similar split):
    - run(): `L.date = true; L.format = 'json'; L.info('msg');`
    - check(entries): `expect(entries[0].date).toBeDefined();`

    PREFIX-03 (caller prefix):
    - run(): `L.stack = true; L.format = 'json'; L.error('msg');`
    - check(entries): `expect(entries[0].caller).toMatch(/\w+\.ts:\d+:\d+/);`

    PREFIX-04 (scope in prefix):
    - run(): `L.scope('myScope').info('msg');`
    - check(entries): `expect(entries[0].scope).toBe('myScope');`

    Apply `not.toMatch(/\x1b\[/)` ANSI absence guards: move to check(entries) as
    `expect(entries[0].raw).not.toMatch(/\x1b\[/)` — the raw field still holds the
    original unmodified line.
  </action>
  <verify>
    pnpm run test -- --project node 2>&1 | grep -E "mixins|prefix|FAIL|PASS" | head -30
  </verify>
  <acceptance_criteria>
    - MIX-01/02/03/04 all pass with the merged run() pattern
    - MIX-03 has ONE run() with 3 sequential limit() calls — no adapter.capture() inside
    - prefix tests use entries[0].level, .raw, .date, .caller, .scope for assertions
    - Browser guards remain in run() (early return); check() handles empty entries gracefully
    - No adapter.capture() inside any run()
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Migrate formats.suite.ts — replace inline parsers with LogOutput fields</name>
  <files>tests/console/formats.suite.ts</files>
  <read_first>
    - tests/console/formats.suite.ts — full file (all JSON/logfmt/pretty format tests)
    - tests/common/suites/suite.ts — TestCase interface
    - .planning/phases/16-browser-playwright-direct/16-RESEARCH.md — formats suite migration example
  </read_first>
  <action>
    EDIT tests/console/formats.suite.ts:

    Note: this file is at tests/console/formats.suite.ts (NOT under tests/common/suites/).
    Adjust import paths accordingly.

    Add `import type { LogOutput } from '../common/output'`.

    For EVERY TestCase in the file, apply the migration pattern:

    1. Remove the outer `const lines = await adapter.capture(() => { ... })` wrapper
    2. Move log calls (with format-setting side effects) directly into run()
    3. Assertions move to check(entries) using LogOutput fields

    CRITICAL — replace these old assertion patterns:
      - `JSON.parse(lines[0].trimEnd()) as Record<string,unknown>` → use `entries[0]` directly
        (LogOutput already has .level, .msg, .date, .scope, .caller)
      - `parseLogfmt(lines[0])` → use `entries[0]` (same LogOutput fields)
      - `toMatchInlineSnapshot(...)` → DELETE and replace with explicit field assertions:
        `expect(entries[0].level).toBe('info')`
        `expect(entries[0].msg).toBe('hello')`

    Example migration for a JSON format test:
    ```ts
    // BEFORE
    {
      name: 'JSON format — info level correct fields',
      run: async (adapter) => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.info('hello'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.level).toBe('info');
        expect(parsed.msg).toBe('hello');
      },
    }

    // AFTER
    {
      name: 'JSON format — info level correct fields',
      run(_adapter) {
        L.format = 'json';
        L.info('hello');
      },
      check(entries) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('hello');
      },
    }
    ```

    For pretty format tests that assert on raw text (bracket format, caller text):
    - `expect(entries[0].raw).toContain('[INFO]')` — raw field is the unmodified original line
    - `expect(entries[0].level).toBe('info')` — from parse()
    - For ANSI absence: `expect(entries[0].raw).not.toMatch(/\x1b\[/)`

    Remove ALL `toMatchInlineSnapshot()` calls. Replace with the minimum field assertions
    that cover the same intent (level + msg + presence of key field).

    Important: L.format = 'json' / 'logfmt' / 'pretty' calls in run() are stimulus — they
    are setting up the adapter for the log call. Keep them in run().
  </action>
  <verify>
    pnpm run test -- --project node 2>&1 | grep -E "formats|FAIL|PASS" | head -30
  </verify>
  <acceptance_criteria>
    - No `JSON.parse(lines[0])` or `parseLogfmt(lines[0])` calls in formats.suite.ts
    - No `toMatchInlineSnapshot` calls remain
    - All assertions use `entries[0].level`, `entries[0].msg`, `entries[0].raw` etc.
    - No `adapter.capture()` inside any run()
    - All format tests pass with pnpm run test --project node
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# No adapter.capture in any run() body in these files
grep -n "adapter\.capture" \
  tests/common/suites/mixins.suite.ts \
  tests/common/suites/prefix.suite.ts \
  tests/console/formats.suite.ts \
  && echo "FAIL" || echo "OK: no adapter.capture in run()"

# No toMatchInlineSnapshot remains in formats suite
grep -n "toMatchInlineSnapshot" tests/console/formats.suite.ts \
  && echo "FAIL: snapshot calls remain" || echo "OK"

# No JSON.parse/parseLogfmt used for assertion context in formats suite
grep -n "JSON\.parse\|parseLogfmt" tests/console/formats.suite.ts | head -10

# Run node tests
pnpm run test -- --project node 2>&1 | tail -20
```

## Success Criteria

- mixins MIX-03 merged into single run() body — 3 sequential limit(2,key) calls
- prefix runs tests work: badge/date/caller/scope visible in entries[0] fields
- formats suite uses LogOutput fields, no JSON.parse inline assertions
- No snapshot assertions in formats.suite.ts
- All three suite test files pass in node project

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-05-medium-suites-SUMMARY.md`
</output>

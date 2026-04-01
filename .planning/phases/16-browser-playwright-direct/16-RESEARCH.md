# Phase 16: suite-adapter-refactor — Research

**Researched:** 2026-04-01
**Domain:** Test infrastructure refactoring — parse layer between raw output and assertions
**Confidence:** HIGH (entire scope is internal to `tests/`, no external dependencies)

## Summary

Phase 16 introduces a structured `LogOutput` parse layer between raw string capture and test
assertions. Every concrete adapter receives a `parse(line)` method; `capture()` wraps the
existing raw-string capture and maps each line through `parse()`, filtering nulls. Every
test case is split into a stimulus function (`run`) and an assertion function (`check`).

The migration is a pure internal refactor — no `src/` files change and no new packages
are needed. The most complex files are `spinners.suite.ts` (fake timers, multi-capture
sequences) and `tests/browser/adapter.ts` (CSS `%c` format string parsing). The safest
execution order is: foundation types → runner → adapters (parallel) → suites (parallel,
spinners last).

**Primary recommendation:** Create `tests/common/output.ts` first, then update the shared
infrastructure in dependency order, then implement `parse()` on each adapter, then migrate
all suites. The parity run in the runner requires the same capture-then-check pattern.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `LogOutput` interface fields: `raw`, `level?`, `scope?`, `msg?`, `date?`, `caller?`,
  `badgeColor?`, `icon?`, `progress?`, `spinnerState?`
- `TestAdapter.capture()` returns `Promise<LogOutput[]>` (not `Promise<string[]>`)
- `TestAdapter.parse(line: string): LogOutput | null`
- `TestCase.check(entries: LogOutput[]): void` (synchronous)
- Runner: `tc.check(await adapter.capture(() => tc.run(adapter)))`
- `TestAdapter.logger` property is **removed**
- All 7 suites migrated: `levels`, `formats`, `mixins`, `options`, `prefix`, `scopes`,
  `spinners`
- All 5 concrete adapters migrated: json, logfmt, pretty, tty, browser
- `adapter.name.startsWith('browser')` guard preserved (spinners.suite uses it)
- `parse()` called internally by `capture()`; callers always receive clean `LogOutput[]`
- `run()` remains the stimulus; no `adapter.capture()` calls inside `run()`
- No-output structural tests keep all logic in `run()`; `check: () => {}` no-op
- `rs.useRealTimers()` moves inside `run()` (at end, before `capture`'s fn returns)
- `Suite` interface unchanged structurally
- **Scope anchor: `tests/` only — `src/` untouched**

### the agent's Discretion

- Exact parsing logic per adapter (regex patterns, JSON.parse strategies)
- Whether `capture` is implemented once in a shared helper or independently per adapter
- How to handle multi-line entries (pretty format caller stack trace) — keep as separate
  `LogOutput` items each
- Internal structure of `parse()` (switch on format, regex, etc.)
- Whether `output.ts` is at `tests/common/output.ts` or `tests/common/types.ts`

### Deferred Ideas (OUT OF SCOPE)

- `src/` changes of any kind
- Browser Playwright integration (previous Phase 16 scope, fully abandoned)
- New test coverage beyond what exists today
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-02 | Shared test helpers for stdout capture (Node console mode) | `captureAsync` already exists; adapter `capture()` wraps it and applies `parse()` |
| INFRA-03 | Shared test helpers for console spy capture (browser mode) | Browser adapter `capture()` wraps spy collection and applies `parse()` |
</phase_requirements>

---

## Current State Analysis

### File inventory

| File | Current role | Change type |
|------|-------------|-------------|
| `tests/common/adapter.ts` | `TestAdapter` interface | MODIFY |
| `tests/common/suites/suite.ts` | `TestCase` / `Suite` interfaces | MODIFY |
| `tests/common/suites/runner.ts` | `runSuite()` | MODIFY |
| `tests/common/capture.helper.ts` | `captureAsync()` raw capture | UNCHANGED (still used internally) |
| `tests/common/logfmt.helper.ts` | `parseLogfmt()` parser | UNCHANGED (used by logfmt `parse()`) |
| `tests/common/suites/levels.suite.ts` | Simple suite | MODIFY |
| `tests/common/suites/formats.suite.ts` | Format assertions | — does not exist here (see below) |
| `tests/console/formats.suite.ts` | Format assertions (JSON/logfmt/pretty) | MODIFY |
| `tests/common/suites/mixins.suite.ts` | Rate-limiting mixins | MODIFY |
| `tests/common/suites/options.suite.ts` | Option getters/setters | MODIFY |
| `tests/common/suites/prefix.suite.ts` | Prefix pipeline | MODIFY |
| `tests/common/suites/scopes.suite.ts` | Scope creation/caching | MODIFY |
| `tests/common/suites/spinners.suite.ts` | Non-TTY spinner lifecycle | MODIFY (complex) |
| `tests/console/json/adapter.ts` | Node console JSON adapter | MODIFY |
| `tests/console/logfmt/adapter.ts` | Node console logfmt adapter | MODIFY |
| `tests/console/pretty/adapter.ts` | Node console pretty adapter | MODIFY |
| `tests/tty/adapter.ts` | Node TTY adapter | MODIFY |
| `tests/browser/adapter.ts` | Browser spy adapter | MODIFY |
| `tests/node/main/console.test.ts` | Standalone Node tests | CHECK (no suites used) |
| `tests/node/main/registry.test.ts` | Registry tests | CHECK (no suites used) |

> **Note on formats.suite location:** The suite is at `tests/console/formats.suite.ts`, not
> under `tests/common/suites/`. It is one of the 7 suites to migrate.

### `TestAdapter` — current interface

```ts
interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;  // ← becomes Promise<LogOutput[]>
  readonly logger: RootLogger;  // ← REMOVED
}
```

### `TestCase` — current interface

```ts
interface TestCase {
  name: string;
  parity?: boolean;
  run: (adapter: TestAdapter) => void | Promise<void>;  // contains stimulus + assertions
  // check is absent
}
```

### Runner — current body

```ts
test(tc.name, async () => {
  await tc.run(mainAdapter);            // run() does: capture + assertions inline
  if (tc.parity !== false && workerAdapter) {
    resetRegistry();
    await workerAdapter.setup();
    if (suite.setup) await suite.setup(workerAdapter);
    await tc.run(workerAdapter);
  }
});
```

### Concrete adapter pattern (all 5 Node adapters identical in structure)

```ts
export const mainAdapter: TestAdapter = {
  name: 'node-console:json',
  setup() { L.format = 'json'; },
  capture: captureAsync,               // ← will wrap captureAsync + apply parse()
  get logger(): RootLogger { return L; }, // ← REMOVED
};
```

---

## Migration Complexity Per File

### `tests/common/output.ts` — **CREATE (trivial)**

New file; exports the `LogOutput` interface verbatim from the context decisions. No
dependencies on any existing file.

### `tests/common/adapter.ts` — **LOW complexity**

- Remove `logger` import (`RootLogger`)
- Replace `capture` return type `Promise<string[]>` → `Promise<LogOutput[]>`
- Add `parse(line: string): LogOutput | null`
- Remove `readonly logger: RootLogger`
- Import `LogOutput` from `./output`

Three lines changed; no logic change.

### `tests/common/suites/suite.ts` — **LOW complexity**

- Import `LogOutput` from `../output`
- Add `check(entries: LogOutput[]): void` to `TestCase`
- Remove `RunTestFunction` type alias or keep it — irrelevant since runner calls `tc.run`
  directly. Can keep for readability.

### `tests/common/suites/runner.ts` — **LOW complexity, HIGH impact**

New runner body per test case:

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

Key change: `tc.run()` no longer called standalone — always wrapped by `adapter.capture()`.

### Concrete adapters — **LOW–MEDIUM per adapter**

Three changes per adapter:
1. Remove `get logger()` getter + the `_typeCheck` type assertion if it relies on logger
2. Change `capture` from `capture: captureAsync` to a proper method that wraps
   `captureAsync` and maps through `parse()`
3. Add a `parse(line: string): LogOutput | null` implementation

The `_typeCheck` type assertion in json/logfmt/pretty/tty adapters (`const _typeCheck: RootLogger = WL`) is purely a compile-time check and can be kept/removed independently.

### Suites — complexity varies

| Suite | Complexity | Key challenge |
|-------|-----------|---------------|
| `levels.suite.ts` | LOW | All assertions are `toHaveLength(n)` on counts — trivially maps to `entries.length` |
| `scopes.suite.ts` | LOW–MEDIUM | Structural API tests (no capture) → `check: () => {}` |
| `mixins.suite.ts` | MEDIUM | Multiple `adapter.capture()` calls in one test case must merge into one run |
| `options.suite.ts` | MEDIUM | Mix of structural tests (no output) and capture tests |
| `prefix.suite.ts` | MEDIUM | Browser guards inline; pretty assertions must use LogOutput fields |
| `formats.suite.ts` | MEDIUM | `JSON.parse(lines[0])` / `parseLogfmt` / `toMatchInlineSnapshot` — move to check() |
| `spinners.suite.ts` | HIGH | Fake timers; multi-capture sequences; `LoggerSpinner` refs across captures |

---

## Parsing Strategy Per Adapter

### Badge → LogLevel mapping (from `src/logger/levels.ts` `LEVEL_DISPLAY`)

| Badge text | `LogOutput.level` |
|------------|-------------------|
| `EMERGENCY` | `emerg` |
| `ALERT` | `alert` |
| `CRITICAL` | `crit` |
| `ERROR` | `error` |
| `WARNING` | `warn` |
| `NOTICE` | `notice` |
| `SUCCESS` | `success` |
| `INFO` | `info` |
| `VERBOSE` | `verb` |
| `DEBUG` | `debug` |
| `WHO CARES?` | `wth` |

This mapping is needed by all adapters that render text badges (pretty, TTY, browser).

### JSON adapter `parse()`

JSON output format: `{"time":"...","level":"info","severity":"info","msg":"hello",...}`

```ts
parse(line: string): LogOutput | null {
  try {
    const p = JSON.parse(line) as Record<string, unknown>;
    if (typeof p.severity !== 'string') return null;
    return {
      raw: line,
      level: p.severity as string,          // use severity, not level (channel name)
      scope: typeof p.scope === 'string' ? p.scope : undefined,
      msg: typeof p.msg === 'string' ? p.msg : undefined,
      date: typeof p.time === 'string' ? p.time : undefined,
      caller: typeof p.caller === 'string' ? p.caller : undefined,
      progress: typeof p.progress !== 'undefined'
        ? p.progress as number
        : undefined,
    };
  } catch {
    return null;                            // malformed line → skip
  }
}
```

**Confidence: HIGH** — format is deterministic; `serializeJSON()` in `src/` is the only
producer and its output is verified by existing tests.

> **Important:** In JSON output, `level` = console method name (channel: `error`, `warn`,
> `info`, `debug`). `severity` = actual log level name (`emerg`, `alert`, ...). `LogOutput.level`
> must map to `severity`, not `level`.

### logfmt adapter `parse()`

logfmt output format: `time="..." level=info severity=info msg="hello world"`

```ts
parse(line: string): LogOutput | null {
  const p = parseLogfmt(line);           // existing helper in logfmt.helper.ts
  if (!p.severity) return null;          // guard: not a log line
  return {
    raw: line,
    level: p.severity,
    scope: p.scope,
    msg: p.msg,
    date: p.time,
    caller: p.caller,
  };
}
```

`parseLogfmt()` already exists and is tested via `formats.suite.ts`. No new parsing logic
needed — reuse the helper directly.

**Confidence: HIGH** — both the parser and the serializer are already tested.

### pretty adapter `parse()`

Pretty output format (non-color): `[BADGE] message` or `[BADGE <scope>] message`
Spinner output: `[ ⋯ ] message` (running) or `[ ✔ ] done` (success) or `[ ✖ ] oops` (fail)
Stack trace lines (TRACE_LEVELS): ` at SomeFunction (file.ts:28:21)` → return `null`

```ts
// Reverse badge→level map derived from LEVEL_DISPLAY
const BADGE_TO_LEVEL: Record<string, string> = {
  'EMERGENCY': 'emerg', 'ALERT': 'alert', 'CRITICAL': 'crit',
  'ERROR': 'error', 'WARNING': 'warn', 'NOTICE': 'notice',
  'SUCCESS': 'success', 'INFO': 'info', 'VERBOSE': 'verb',
  'DEBUG': 'debug', 'WHO CARES?': 'wth',
};

parse(line: string): LogOutput | null {
  const stripped = stripAnsi(line);
  if (/^\s+at /.test(stripped)) return null;          // stack trace line
  if (stripped.trim().length === 0) return null;

  // Spinner icon bracket: [ ⋯ ] or [ ✔ ] or [ ✖ ] or [ - ]
  const iconMatch = stripped.match(/^\[?\s*(\S+)\s*\]\s*(.*)/);
  if (iconMatch && iconMatch[1].length <= 3 && !iconMatch[1].startsWith('[')) {
    const icon = iconMatch[1];
    const spinnerState =
      icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
    return { raw: line, icon, spinnerState, msg: iconMatch[2].trim() };
  }

  // Level badge: [BADGE] or [BADGE <scope>]
  const badgeMatch = stripped.match(/^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/);
  if (badgeMatch) {
    const badgeText = badgeMatch[1].trim();
    const scope = badgeMatch[2];
    const msg = badgeMatch[3];
    const level = BADGE_TO_LEVEL[badgeText];
    return { raw: line, level, scope, msg };
  }

  return { raw: line };                               // unrecognised but non-null
}
```

**Confidence: MEDIUM** — pretty format is regex-parsed; test cases set `L.pad = false`
so badge width is fixed. ANSI stripping needed when tests have `L.color = true` (default).
A robust `stripAnsi` helper (ANSI escape regex `\x1b\[[0-9;]*m`) must be included or reused.

> **Key insight:** The test suite sets `L.color = false` implicitly for many prefix tests
> (`not.toMatch(/\x1b\[/)`). But defaults may enable color. A defensive `stripAnsi()` in
> `parse()` is safer than assuming no ANSI.

### TTY adapter `parse()`

TTY adapter also uses pretty format (`L.format = 'pretty'`) and `captureAsync` on
`process.stdout`. The output differs from console pretty in one way: ANSI color IS applied
(real TTY mode is active via resolve.alias). The parse() logic is identical to pretty —
strip ANSI first, then parse badge/icon/text.

**Recommendation:** Extract `parsePrettyLine()` as a shared internal helper used by both
the pretty adapter and the TTY adapter. This avoids duplicating the badge→level regex.

### browser adapter `parse()`

Browser output: `c[0]` = the format string argument; CSS args in `c[1], c[2], ...` are
discarded by the current capture (only `c[0]` is collected).

Format string examples:
- `%c[INFO]%c hello` — styled badge; level=INFO, msg=hello
- `%c[INFO <scope>]%c hello` — with scope
- `%c[ERROR]%c err message` — error without badge brackets
- `%c-%c ...` — browser spinner running (`-` = `BROWSER_DEFAULT_RUNNING_ICON.icon`)
- `%c✔%c` — spinner success
- `%c✖%c` — spinner fail

```ts
parse(line: string): LogOutput | null {
  if (!line || line.trim().length === 0) return null;

  // Strip %c markers to get readable text
  const text = line.replace(/%c/g, '').trim();
  if (text.length === 0) return null;

  // Spinner icon: short character (1–2 chars) not wrapped in []
  // Browser uses '-', '✔', '✖' as running/success/fail icons
  const spinnerIconMatch = text.match(/^([✔✖\-])\s*(.*)/);
  if (spinnerIconMatch && spinnerIconMatch[1].length <= 2) {
    const icon = spinnerIconMatch[1];
    const spinnerState: LogOutput['spinnerState'] =
      icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
    return { raw: line, icon, spinnerState, msg: spinnerIconMatch[2].trim() };
  }

  // Level badge: [BADGE] or [BADGE <scope>] extracted from the text
  const badgeMatch = text.match(/^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/);
  if (badgeMatch) {
    const badgeText = badgeMatch[1].trim();
    const scope = badgeMatch[2];
    const msg = badgeMatch[3];
    const level = BADGE_TO_LEVEL[badgeText];
    return { raw: line, level, scope, msg };
  }

  return { raw: line };
}
```

**Confidence: MEDIUM** — the format string structure is readable from `renderBrowserPrefix()`
in `src/logger/prefix/render.ts`. The `%c` stripping then badge match is robust for the
current output format.

> **Browser adapter — important note on capture ordering:** The current `capture()` collects
> calls from all 5 spies (`log`, `warn`, `error`, `debug`, `groupCollapsed`) by spreading
> their call arrays **after** `fn()` completes. The resulting order is: all `log` calls,
> then all `warn`, etc. — NOT interleaved chronologically. This affects multi-emit tests
> (e.g. spinners that emit multiple levels). This ordering issue exists today and is
> unchanged by this phase.

---

## Suite Migration Patterns

### Reference pattern: `levels.suite.ts` (simplest)

**Current structure:** `run(adapter)` calls `adapter.capture()` internally and contains
`expect(lines).toHaveLength(n)`.

**After migration:**
```ts
{
  name: 'emerg emits exactly one line',
  run(adapter) {
    // stimulus only — no capture, no assertions
    (L as any)['emerg']('msg');
  },
  check(entries) {
    expect(entries).toHaveLength(1);
  },
},
```

The key insight: `run()` no longer calls `adapter.capture()`. The runner wraps `run()` in
`capture()`. Every `const lines = await adapter.capture(() => { ... })` collapses to just
the inner log calls, and assertions move to `check()`.

### `formats.suite.ts` (medium — existing parsers move to `check()`)

Current tests do inline `JSON.parse(lines[0])` and `parseLogfmt(lines[0])`. After
migration, this parsing is done by `adapter.parse()` before `check()` receives entries.

```ts
// BEFORE
run: async (adapter) => {
  L.format = 'json';
  const lines = await adapter.capture(() => L.info('hello'));
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
  expect(parsed.level).toBe('info');
  expect(parsed.msg).toBe('hello');
},

// AFTER
run(adapter) {
  L.format = 'json';
  L.info('hello');
},
check(entries) {
  expect(entries).toHaveLength(1);
  expect(entries[0].level).toBe('info');
  expect(entries[0].msg).toBe('hello');
},
```

**`toMatchInlineSnapshot` calls:** These will need to be removed or replaced with field
assertions. Inline snapshots assert on raw string format which is now an adapter
implementation detail. Replace with semantic assertions on `entries[0].level`,
`entries[0].msg`, etc.

### `options.suite.ts` and `scopes.suite.ts` (no-output structural tests)

Many tests assert only on return values and API shape — they produce no log output:

```ts
{
  name: 'L.scope() returns a ScopeLogger with scope property and all level methods',
  run(_adapter) {
    // same logic as before — no capture needed
    const s = L.scope('scope-01-api');
    expect(s.scope).toBe('scope-01-api');
    for (const level of LogLevels) expect(typeof s[level]).toBe('function');
  },
  check: () => {},  // no-op — assertions live in run()
},
```

**Mixing note:** Some tests in `options.suite.ts` have both structural assertions AND
log output capture. For these, the structural assertions stay in `run()` and the log
output assertions move to `check()`.

### `spinners.suite.ts` (most complex)

**Problem 1 — Fake timers inside run():**

Current pattern:
```ts
run: async (adapter) => {
  const lines = await adapter.capture(() => {
    rs.useFakeTimers();
    L.scope('spin-01-tick').info.spin('loading');
    rs.advanceTimersByTime(TICK_ADVANCE);
  });
  rs.useRealTimers();    // ← OUTSIDE capture, after it returns
  expect(lines.length).toBeGreaterThanOrEqual(2);
},
```

After migration, `run()` IS the fn() inside `capture()`. So:
```ts
run(adapter) {
  rs.useFakeTimers();
  L.scope('spin-01-tick').info.spin('loading');
  rs.advanceTimersByTime(getTickAdvance(adapter));
  rs.useRealTimers();    // ← INSIDE run, which is inside capture's fn()
},
check(entries) {
  expect(entries.length).toBeGreaterThanOrEqual(2);
},
```

This is safe because `capture()` does `await fn()` — when `fn` returns, timers are
already real. The CONTEXT.md explicitly confirms this pattern.

**Problem 2 — Multi-capture sequences with cross-capture `LoggerSpinner` refs:**

Several tests use multiple `adapter.capture()` calls to isolate stimulus phases:

```ts
// CURRENT — two separate captures with a shared spinner ref
run: async (adapter) => {
  let sp!: LoggerSpinner;
  await adapter.capture(() => {
    sp = L.scope('spin-01-stop').info.spin('task');
  });
  const lines = await adapter.capture(() => {
    sp.stop();
  });
  expect(lines).toHaveLength(0);  // stop emits nothing
},
```

These cannot use inner `adapter.capture()` calls inside the new `run()`. **Refactoring
strategy: merge all phases into one run, restructure assertions.**

```ts
// AFTER — single capture; all stimulus in run(); assertions on total entries
{
  name: 'stop() terminates the spinner without emitting output',
  run(adapter) {
    // Phase 1: start
    const sp = L.scope('spin-01-stop').info.spin('task');
    // Phase 2: stop — silent
    sp.stop();
  },
  check(entries) {
    // entries = start frame only (stop emitted 0, captured 0 additional)
    // The start produces exactly 1 entry; stop adds nothing.
    expect(entries).toHaveLength(1);
    expect(entries[0].spinnerState).toBe('running');
  },
},
```

For the SPIN-02 idempotency tests (success/fail after stop → 0 additional lines):
```ts
{
  name: 'success/fail after stop() emits zero additional lines',
  run(adapter) {
    const sp = L.scope('spin-02-after-stop').info.spin('task');
    sp.stop();
    sp.success();  // terminal — no output
    sp.fail();     // terminal — no output
  },
  check(entries) {
    // Only the initial start frame is in entries; stop/success/fail add nothing
    expect(entries).toHaveLength(1);
  },
},
```

**Problem 3 — `getRunningIcon(adapter)` and `getTickAdvance(adapter)` helpers:**

These helpers read `adapter.name` to determine environment-specific values. Since
`run(adapter)` still receives the adapter as argument, this is unchanged. The helpers
are called inside `run()` using the adapter parameter.

---

## Dependency Order (Wave Planning)

### Wave 0 — Foundation (must complete before anything else)

| Task | File | Reason |
|------|------|--------|
| Create `output.ts` | `tests/common/output.ts` | All other files import `LogOutput` |
| Update `adapter.ts` | `tests/common/adapter.ts` | Interface shape change — affects all adapters |
| Update `suite.ts` | `tests/common/suites/suite.ts` | `check` field required by all suites |
| Update `runner.ts` | `tests/common/suites/runner.ts` | New flow: capture → run → check |

**After Wave 0 the project will NOT compile** — existing suites and adapters still return
`string[]` and have no `check` property. This is acceptable if the entire migration is
done in one atomic commit per wave.

### Wave 1 — Adapters (can run in parallel after Wave 0)

| Task | File | Dependency |
|------|------|------------|
| JSON adapter `parse()` | `tests/console/json/adapter.ts` | Wave 0 complete |
| logfmt adapter `parse()` | `tests/console/logfmt/adapter.ts` | Wave 0 complete |
| pretty adapter `parse()` | `tests/console/pretty/adapter.ts` | Wave 0 complete |
| TTY adapter `parse()` | `tests/tty/adapter.ts` | Wave 0 complete |
| browser adapter `parse()` | `tests/browser/adapter.ts` | Wave 0 complete |

All 5 adapters can be implemented in parallel. The `capture()` method on each must wrap
`captureAsync` (Node adapters) or the spy collection (browser adapter) and apply
`parse()` internally.

> **Shared helper opportunity:** `parsePrettyLine()` + `stripAnsi()` + `BADGE_TO_LEVEL`
> map can live in a shared internal module (e.g. `tests/common/parse-pretty.ts`) imported
> by both pretty and TTY adapters. This is at the planner's/agent's discretion.

### Wave 2 — Suites (can run in parallel after Wave 1; spinners last)

| Task | File | Notes |
|------|------|-------|
| `levels.suite.ts` | `tests/common/suites/levels.suite.ts` | Reference impl; do first as validation |
| `formats.suite.ts` | `tests/console/formats.suite.ts` | Remove inline JSON.parse; remove snapshots |
| `mixins.suite.ts` | `tests/common/suites/mixins.suite.ts` | Multiple captures → single run |
| `options.suite.ts` | `tests/common/suites/options.suite.ts` | Structural tests keep assertions in run |
| `prefix.suite.ts` | `tests/common/suites/prefix.suite.ts` | Browser guards in run() stay |
| `scopes.suite.ts` | `tests/common/suites/scopes.suite.ts` | Mostly structural no-ops |
| `spinners.suite.ts` | `tests/common/suites/spinners.suite.ts` | Do last; highest complexity |

---

## Risk Areas

### Risk 1: Multi-capture spinners restructuring (HIGH)

**What:** 8+ tests in `spinners.suite.ts` use multiple `adapter.capture()` calls with
shared `LoggerSpinner` refs. The new model allows only one capture per test.

**Mitigation:** Merge phases into single `run()`, restructure assertions to check total
entries rather than per-phase output. The spinner lifecycle guarantees deterministic output:
start always emits 1 frame; stop/success/fail after terminal state always emit 0.

**Assertion translation:**
- Old: `expect(phase2Lines).toHaveLength(0)` (isolated inner capture)
- New: `expect(entries).toHaveLength(1)` (all of run; stop adds nothing to total)

### Risk 2: `toMatchInlineSnapshot` in `formats.suite.ts` (MEDIUM)

**What:** 2 snapshot tests assert on raw string format (JSON and logfmt lines). After
migration, these should use `LogOutput` field assertions instead.

**Mitigation:** Delete snapshot assertions, replace with field-level `expect(entries[0].level)`
etc. The snapshot content is a test style choice, not a requirement.

### Risk 3: ANSI strip in pretty/TTY `parse()` (MEDIUM)

**What:** Pretty output may include ANSI sequences when `L.color = true` (default). The
badge regex must work with or without ANSI wrapping.

**Mitigation:** A `stripAnsi` function using `/\x1b\[[0-9;]*m/g` regex applied before all
pattern matching. This is a verified, standard approach. No external library needed.

### Risk 4: Browser `%c` format string structure change (LOW)

**What:** If `renderBrowserPrefix()` format changes, the `parse()` regex fails silently
(returns `{ raw: line }` with no fields).

**Mitigation:** Phase scope is `tests/` only; `src/` is not changing. Browser format is
stable. Parse failures produce `{ raw: line }` (non-null), not `null`, so tests that
assert on field presence will catch regressions.

### Risk 5: `capture()` delegation change breaking `captureAsync` semantics (LOW)

**What:** Currently `capture: captureAsync` is a direct function assignment. After
migration it becomes a method body wrapping `captureAsync`. Subtle difference: `this`
context inside the method vs. the assigned function.

**Mitigation:** The new `capture` implementation does not use `this` (it calls the
module-level `captureAsync`). No semantic difference.

### Risk 6: `formats.suite.ts` location (LOW)

**What:** The suite is at `tests/console/formats.suite.ts`, not under `tests/common/suites/`.
The CONTEXT.md file list calls it `tests/console/formats.suite.ts` — this is correct and
matches the actual file.

**Mitigation:** No risk; just be explicit in the plan that this is not a `tests/common`
file.

---

## Test Continuity Strategy

**Approach: Big-bang migration in 3 atomic waves, tests green at end of each wave.**

Wave 0 introduces compile errors (missing `parse`, wrong `capture` return type, missing
`check`). This is acceptable as a transient state within a development branch.

Wave 1 restores type correctness for adapters but suites still lack `check`. Tests will
pass at the TypeScript level only after Wave 2 completes.

**Alternative (incremental):** Add `check?: (entries: LogOutput[]) => void` as optional
to `TestCase`, and have the runner call it only if defined. This allows migrating suites
one at a time while tests remain green throughout. More steps, lower risk.

**Recommendation:** Use the incremental approach (optional `check`) if test continuity
during migration is a priority. Use big-bang if atomicity is preferred.

The CONTEXT.md locks `check(entries: LogOutput[]): void` — it should be present on all
`TestCase` objects. Whether the TypeScript interface makes it optional during transition
is at the planner's discretion.

---

## `capture()` Implementation Pattern

Every Node adapter (json, logfmt, pretty, tty) currently assigns `capture: captureAsync`
directly. After migration:

```ts
// Pattern for all Node adapters
async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
  const rawLines = await captureAsync(fn);
  return rawLines
    .map((line) => this.parse(line))
    .filter((e): e is LogOutput => e !== null);
},
```

The browser adapter is different — it collects via spies, not streams. The filter/map
pattern is the same after collection:

```ts
// Inside browser adapter capture()
const rawLines = [
  ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
  // ... other spies ...
].filter((l) => l.length > 0 && !/^\s+at /.test(l));

return rawLines
  .map((line) => this.parse(line))
  .filter((e): e is LogOutput => e !== null);
```

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely internal `tests/` refactoring. No external
tools, services, or runtimes beyond the existing test infrastructure (`pnpm`, `rstest`).

---

## Validation Architecture

Test framework: rstest (`@rstest/core`) — already configured.

Quick run: `pnpm run test`
Full suite: `pnpm run test`

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Verified by |
|--------|----------|-----------|-------------|
| INFRA-02 | stdout capture works and returns `LogOutput[]` | integration | All Node adapter tests pass |
| INFRA-03 | console spy capture works and returns `LogOutput[]` | integration | Browser adapter tests pass |

### Wave 0 Gaps

None — test infrastructure exists. The migration updates existing infrastructure.

---

## Open Questions

1. **`check` required vs optional during transition**
   - What we know: CONTEXT.md says `check(entries: LogOutput[]): void` (required)
   - What's unclear: Whether making it optional during migration is acceptable
   - Recommendation: Make it optional in `suite.ts` during Wave 2, enforce required at end

2. **Shared `parsePrettyLine()` helper**
   - What we know: pretty and TTY adapters need identical badge parsing logic
   - What's unclear: Whether a shared file is the right choice vs. inline duplication
   - Recommendation: Create `tests/common/parse-pretty.ts` with `stripAnsi` + `parsePrettyLine`

3. **`progress` field in LogOutput from logfmt**
   - What we know: logfmt serializer emits `progress=...` as JSON string
   - What's unclear: Whether `parseLogfmt` parses it correctly for complex values
   - Recommendation: For now, leave `progress` field as `undefined` in logfmt parse();
     no test currently asserts on `entries[0].progress` for logfmt

4. **`spinnerState` for stop()**
   - What we know: `stop()` emits no output → no LogOutput produced
   - What's unclear: Whether a `'stop'` state is worth representing in output
   - Recommendation: `spinnerState: 'stop'` is in the interface but will only appear
     if the adapter emits a line for stop (it currently doesn't)

---

## Sources

### Primary (HIGH confidence)
- `tests/common/adapter.ts` — current TestAdapter interface (read directly)
- `tests/common/suites/runner.ts` — current runner logic (read directly)
- `tests/common/suites/spinners.suite.ts` — most complex suite (read directly)
- `src/logger/prefix/serialize.ts` — JSON/logfmt output field structure (read directly)
- `src/logger/levels.ts` — LEVEL_DISPLAY badge labels (read directly)
- `src/logger/prefix/render.ts` — browser `%c` format string structure (read directly)
- `.planning/phases/16-browser-playwright-direct/16-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- `tests/common/logfmt.helper.ts` — `parseLogfmt()` implementation verified reusable
- `src/logger/mixins/spinner/console/const.ts` — spinner icon characters verified

---

## Metadata

**Confidence breakdown:**
- Foundation changes (output.ts, adapter.ts, suite.ts, runner.ts): HIGH — interfaces are
  fully specified in CONTEXT.md, no ambiguity
- Adapter parse() implementations: MEDIUM–HIGH — JSON/logfmt HIGH (structured format);
  pretty/TTY MEDIUM (regex-based); browser MEDIUM (format string parsing)
- Suite migrations: HIGH for simple suites; MEDIUM for spinners (restructuring required)
- Risk identification: HIGH — all risks derived from reading actual code

**Research date:** 2026-04-01
**Valid until:** Indefinite — scope is entirely internal; no external dependencies to drift

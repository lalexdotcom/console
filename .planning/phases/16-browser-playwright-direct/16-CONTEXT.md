# Phase 16: suite-adapter-refactor — Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** Architect discussion (locked decisions — full scope replacement)

<domain>
## Phase Boundary

Refactor the shared test infrastructure (`TestAdapter`, `TestCase`, `Suite`, runner, all suites, all concrete adapters) to introduce a **parse layer** between raw captured output and test assertions.

After this phase:
- `TestAdapter.capture()` returns `Promise<LogOutput[]>` (not `Promise<string[]>`)
- `TestAdapter.parse(line: string): LogOutput | null` extracts structured fields from one raw line
- `TestCase` has a `check(entries: LogOutput[]): void` method for assertions
- The runner calls `tc.check(await adapter.capture(() => tc.run(adapter)))`
- All 7 suites (`levels`, `formats`, `mixins`, `options`, `prefix`, `scopes`, `spinners`) are migrated to use `check()`
- All concrete adapters (json, logfmt, pretty, tty, browser) implement `parse()`
- `TestAdapter.logger` property is removed (never used by any suite)

**Scope anchor:** This phase touches `tests/` only. `src/` is untouched.

**Previous scope (Phase 16 was "browser-playwright-direct") is entirely abandoned.**

</domain>

<decisions>
## Implementation Decisions

### LogOutput — the common structured type

```ts
interface LogOutput {
  raw: string;              // always present — the original unmodified line
  level?: string;           // 'emerg' | 'alert' | 'crit' | 'error' | 'warn' | 'notice' | 'info' | 'debug' | 'trace' | 'wth'
  scope?: string;           // scope name, undefined for root logger
  msg?: string;             // message content
  date?: string;            // date/timestamp string as emitted (not parsed)
  caller?: string;          // 'file.ts:28:21' without parentheses
  badgeColor?: string;      // ANSI escape sequence or CSS string depending on adapter
  icon?: string;            // spinner icon character (e.g. '⋯', '✔', '✖', '-')
  progress?: number;        // 0–100 for progress spinners
  spinnerState?: 'running' | 'success' | 'fail' | 'stop';
}
```

### TestAdapter interface

```ts
interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  parse(line: string): LogOutput | null;   // null for non-parsable lines
  capture(fn: () => void | Promise<void>): Promise<LogOutput[]>;
}
```

- `parse()` is called internally by `capture()` on each intercepted line
- `capture()` filters out `null` results before returning: `.filter((e): e is LogOutput => e !== null)`
- `logger` property is **removed** — all suites use `L` global directly
- `name` still starts with `'browser'` for browser adapters (used by spinners.suite for interval constants)

### TestCase interface

```ts
interface TestCase {
  name: string;
  parity?: boolean;          // default true (unchanged)
  run(adapter: TestAdapter): void | Promise<void>;   // stimulus — fires log calls
  check(entries: LogOutput[]): void;                 // assertions on parsed output
}
```

- `run` receives the adapter for the rare case where adapter metadata is needed (e.g. `adapter.name.startsWith('browser')` guard)
- `check` is synchronous — assertions are immediate
- `parity` semantics unchanged: when true, runner re-runs both `run` + `check` against the worker adapter

### Suite interface

Unchanged structurally:

```ts
interface Suite {
  name: string;
  description?: string;
  setup?(adapter: TestAdapter): void | Promise<void>;
  tests: TestCase[];
}
```

### Runner logic

```ts
// New runner body per test case:
const entries = await adapter.capture(() => tc.run(adapter));
tc.check(entries);
```

Parity re-run:
```ts
resetRegistry();
await workerAdapter.setup();
if (suite.setup) await suite.setup(workerAdapter);
const entriesW = await workerAdapter.capture(() => tc.run(workerAdapter));
tc.check(entriesW);
```

### parse() return — nullable

`parse(line: string): LogOutput | null` returns `null` for lines that are not log output:
- Stack trace lines (`at Function.xxx (file.ts:28:21)`)
- Empty lines
- Any line the adapter cannot recognise as a log entry

`capture()` filters nulls internally — callers always receive clean `LogOutput[]`.

### Suite migration strategy

Each suite replaces `run(adapter)` — which contained both stimulus + assertions — with:
- `run(adapter)` — stimulus only (log calls, timer advances)
- `check(entries)` — all `expect()` calls moved here, using `LogOutput` fields

The **no-output structural tests** (tests that assert on return values of `L.scope()`, API shape, cache identity) still live in `run()` because they produce no log output. Their `check` can be a no-op: `check: () => {}`.

### Fake timers in spinners.suite

`rs.useRealTimers()` moves inside `run()` (called at the end of `run`, before `capture` returns):

```ts
run(adapter) {
  rs.useFakeTimers();
  L.scope('spin-tick').info.spin('loading');
  rs.advanceTimersByTime(TICK_ADVANCE);
  rs.useRealTimers();    // ← end of run, inside capture's fn()
},
check(entries) {
  expect(entries.length).toBeGreaterThanOrEqual(2);
  expect(entries[0].spinnerState).toBe('running');
  expect(entries[0].icon).toBeDefined();
}
```

This works because `capture` does `await fn()` — when `fn` returns, timers are already restored.

### Files changed

| File | Action |
|------|--------|
| `tests/common/output.ts` | **CREATE** — exports `LogOutput` interface |
| `tests/common/adapter.ts` | **MODIFY** — add `parse`, change `capture` return type, remove `logger` |
| `tests/common/suites/suite.ts` | **MODIFY** — add `check` to `TestCase` |
| `tests/common/suites/runner.ts` | **MODIFY** — new runner logic |
| `tests/common/suites/levels.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/formats.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/mixins.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/options.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/prefix.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/scopes.suite.ts` | **MODIFY** — split run/check |
| `tests/common/suites/spinners.suite.ts` | **MODIFY** — split run/check, move useRealTimers |
| `tests/console/json/adapter.ts` | **MODIFY** — implement `parse()`, remove `logger`, change `capture` return type |
| `tests/console/logfmt/adapter.ts` | **MODIFY** — implement `parse()`, remove `logger`, change `capture` return type |
| `tests/console/pretty/adapter.ts` | **MODIFY** — implement `parse()`, remove `logger`, change `capture` return type |
| `tests/tty/adapter.ts` | **MODIFY** — implement `parse()`, remove `logger`, change `capture` return type |
| `tests/browser/adapter.ts` | **MODIFY** — implement `parse()`, remove `logger`, change `capture` return type |
| `tests/node/main/console.test.ts` | **CHECK** — likely no changes; does not use shared suites |
| `tests/node/main/registry.test.ts` | **CHECK** — likely no changes; does not use shared suites |

### the agent's Discretion

- Exact parsing logic per adapter (regex patterns, JSON.parse strategies)
- Whether `capture` is implemented once in a shared helper or independently per adapter
- How to handle multi-line entries (e.g. pretty format with caller on next line) — may keep as separate `LogOutput` items each
- Internal structure of `parse()` (switch on format, regex, etc.)
- Whether `output.ts` is at `tests/common/output.ts` or `tests/common/types.ts`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current interfaces (to be replaced)
- `tests/common/adapter.ts` — current `TestAdapter` interface
- `tests/common/suites/suite.ts` — current `TestCase` / `Suite` interfaces
- `tests/common/suites/runner.ts` — current runner implementation

### Concrete adapters (to be migrated)
- `tests/console/json/adapter.ts` — Node console JSON adapter (reference for `capture` pattern)
- `tests/tty/adapter.ts` — TTY adapter
- `tests/browser/adapter.ts` — browser adapter

### Suites (all 7 to be migrated)
- `tests/common/suites/spinners.suite.ts` — most complex; fake timers, live LoggerSpinner refs
- `tests/common/suites/levels.suite.ts` — simplest; good reference for migration pattern
- `tests/console/formats.suite.ts` — console-only suite

### Capture helper
- `tests/common/capture.helper.ts` — current `captureAsync` used by all Node adapters

### Types
- `src/types.ts` — `RootLogger`, `LoggerSpinner` etc.

</canonical_refs>

<deferred>
## Deferred Ideas

- **Browser Playwright direct** — the original phase 16 scope (direct Playwright instance, `page.on('console')`) is deferred to a future phase. The `LogOutput`-based adapter for browser will use Node-side spyOn for now.
- **Parity assertions** — `expect(mainEntries).toEqual(workerEntries)` field-by-field comparison across adapters deferred.
- **parse() unit test file** — a dedicated `adapter.parse.test.ts` per adapter to test the parser in isolation is a good idea but out of scope for this phase. Noted for backlog.

</deferred>

---

*Phase: 16-browser-playwright-direct (scope replaced)*
*Context gathered: 2026-03-31 via architect discussion*

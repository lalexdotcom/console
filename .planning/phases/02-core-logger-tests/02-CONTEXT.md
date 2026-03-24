# Phase 2: Core Logger Tests - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Write an exhaustive test suite for the core logging pipeline, exercising it solely through
Node console mode (json/logfmt/pretty output to process.stdout / process.stderr). This covers
all 11 log levels, the three output formats, the prefix pipeline, option cascading, scoped loggers,
rate-limiting and one-shot mixins, the singleton registry, and console patch/unpatch.

No TTY rendering, no browser output, no spinner, no worker — those are Phase 3 and 4.

</domain>

<decisions>
## Implementation Decisions

### Test File Organization
- **D-01:** One file per requirement group inside `tests/node/main/`. Files:
  `levels.test.ts`, `formats.test.ts`, `prefix.test.ts`, `options.test.ts`,
  `scopes.test.ts`, `mixins.test.ts`, `registry.test.ts`, `console.test.ts`.
- **D-02:** Each file uses `describe()` blocks to group closely related tests
  (e.g. `describe('JSON format', ...)` inside `formats.test.ts`).
- **D-03:** The existing `smoke.test.ts` in `tests/node/main/` is left untouched —
  it stays as the initial pass/fail gate.

### Console Method Dispatch (CORE-01)
- **D-04:** Verify level→method dispatch via a `captureAll()` helper that intercepts
  both `process.stdout.write` and `process.stderr.write` simultaneously. Returns
  `{ stdout: string[], stderr: string[] }`.
  - Levels that map to `console.error` / `console.warn` (emerg, alert, crit, error, warn)
    → output appears in **stderr**.
  - All other levels (notice, success, info, verb, debug, wth) → output appears in **stdout**.
  - Add `captureAll` to `tests/helpers/`.
- **D-05:** No library APIs (`bypass`, instrumentation flags) are used for dispatch assertions —
  the test relies solely on stream separation, which is independent of the library internals.

### Format Assertions (CORE-04, CORE-05, CORE-06)
- **D-06:** **JSON format**: `JSON.parse()` the captured line. Assert presence and value of core
  fields: `time` (ISO 8601), `level` (channel name), `severity` (level string), `msg` (string).
  Assert `data` when the call includes extra args. Assert `scope` when testing a scope logger.
  Assert `caller` when `stack: true` is set. Assert `progress` for spinner prefix tests (Phase 3).
  Take a `toMatchInlineSnapshot()` snapshot of the full JSON string for regression coverage.
- **D-07:** **logfmt format**: Parse the line with a `key=value` regex. Assert each expected
  key is present with the correct value. Also snapshot the raw line.
- **D-08:** **pretty format**: `renderConsolePrefix` produces plain text — no ANSI codes.
  Assert the captured string includes the level badge text (e.g. `[INFO]`, `[ERROR]`).
  Snapshot the full line for regression coverage.

### Mixin / Rate-Limit Testing (MIX-01, MIX-02, MIX-03, MIX-04)
- **D-09:** Use `L.scope('unique-per-test-name')` instead of the root `L` for every mixin test.
  Because `reset.ts` deletes all scopes in `beforeEach`, each test receives a freshly-created
  scope with its own `entries` Map — counters start at zero automatically.
- **D-10:** An explicit `key` string must be passed to `L.scope(s).limit(n, key)` in MIX-03
  tests, so multiple call-sites are grouped under one counter deliberately.

### Agent's Discretion
- Helper implementation details for `captureAll` (buffering, TextDecoder for Uint8Array, etc.)
- Exact snapshot strings (generated and committed on first run)
- Whether to share a helper `parseLogfmt(line): Record<string, string>` utility or inline the regex

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Code — Core Pipeline
- `src/logger/index.ts` — Singleton registry, level dispatch map (`LEVEL_METHODS`), `computeOptions`, `emitConsole`, `emitTTY`, all public API methods (scope, patch, unpatch, bypass, restore, exclusive, format, options)
- `src/logger/dispatch.ts` — `DispatchFn` and `DispatchOptions` types
- `src/logger/prefix/serialize.ts` — `serializeJSON`, `serializeLogfmt` — defines exact field names and ordering for JSON/logfmt assertions
- `src/logger/prefix/render.ts` — `renderConsolePrefix` (plain-text prefix), `renderBrowserPrefix` (browser only — not relevant here), `renderTTYPrefix` (TTY only — not relevant here)
- `src/logger/prefix/index.ts` — `getPrefix` — builds the `Prefix[]` array fed to serializers
- `src/logger/mixins/limit.ts` — `createLimitMixin`, `getLimitCallerKey` — explains counter lifecycle and call-site key mechanics
- `src/logger/mixins/override.ts` — `createOverrideMixin` — `options({...}).level()` one-shot pattern (MIX-04)
- `src/levels.ts` — `LogLevels`, `LEVEL_METHODS` (severity ordering), `TRACE_LEVELS` Set
- `src/logger/const.ts` — `DEFAULT_LOGGER_OPTIONS`
- `src/logger/types.ts` — `LoggerOptions`, `LogLevel`, `RootLogger`, `ScopeLogger`, `LimitedLogger`

### Test Infrastructure (Phase 1 output)
- `tests/helpers/stdout.ts` — `captureStdout(fn)` wrapper
- `tests/helpers/reset.ts` — `beforeEach` registry reset (imported by every test file that uses the singleton)
- `tests/helpers/console-spy.ts` — browser console spy (not used in Node tests — reference only)
- `tests/node/main/smoke.test.ts` — baseline smoke test (do not modify)

### Requirements
- `.planning/REQUIREMENTS.md` — CORE-01 through CORE-08, PREFIX-01 through PREFIX-04, OPT-01 through OPT-04, SCOPE-01 through SCOPE-04, MIX-01 through MIX-04, REG-01 through REG-04, CONS-01 through CONS-04

### Project Configuration
- `rstest.config.ts` — test runner config (node project entry, browser project entry)
- `tsconfig.json` — TypeScript strict config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `captureStdout(fn)` — already captures `process.stdout.write`. The new `captureAll(fn)` helper extends this pattern to also intercept `process.stderr.write`.
- `reset.ts` `beforeEach` — delete all scopes + clear exclusive/format/rootOptions. Must be imported in every new test file that touches the singleton.
- `smoke.test.ts` — minimal passing test; leave untouched.

### Established Patterns
- Functional wrapper pattern for helpers: `captureStdout(() => { ... })` returns captured chunks.
- `beforeEach` reset is side-effect based (import triggers registration) — just `import '../helpers/reset'` at the top of each test file.
- Named exports only; no default exports.
- `@rstest/core` exports: `test`, `describe`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`.

### Integration Points
- `L` is exported from `src/logger/index.ts` as the singleton root logger.
- `L.scope('name')` creates a cached `ScopeLogger` stored in `registry.scopes`.
- `L.format = 'json' | 'logfmt' | 'pretty'` — controls the output format.
- `L.patch()` / `L.unpatch()` replace/restore native `console.*` methods.
- `L.bypass(c)` / `L.restore()` redirect output to a custom console object and back.
- `L.exclusive = L` / `delete L.exclusive` — exclusive lock on the registry.

### Key Behavioral Notes
- In Node non-TTY mode, JSON and logfmt output always goes through the resolved
  `LEVEL_METHODS[level]` function (i.e. `console.error`, `console.warn`, `console.info`,
  `console.debug`). This means `error`/`warn`-level output lands in **stderr**, all others
  in **stdout** — leveraged by `captureAll` for CORE-01 dispatch assertions.
- `computeOptions` applies "strictest level wins" for the `level` option: numeric index
  comparison via `LEVEL_METHODS` (the severity map). Testing cascading requires setting
  conflicting levels on root and scope separately.
- `TRACE_LEVELS = Set(['emerg','alert','crit','error','warn'])` after ADJ-01 fix —
  these levels produce a stack trace (or groupCollapsed in browser). Tests should avoid
  unintentionally triggering stack capture overhead; use `stackOffset: null` or set
  `stack: false` in option-focused tests where trace output is noise.

</code_context>

<specifics>
## Specific Ideas

- Format assertions use `toMatchInlineSnapshot()` for exact string regression, plus per-field
  `expect().toBe()` checks for semantic correctness. Snapshot strings are committed on first run.
- `captureAll()` returns `{ stdout: string[], stderr: string[] }` — same functional wrapper
  pattern as `captureStdout`.
- For logfmt, a shared `parseLogfmt(line: string): Record<string, string>` helper in
  `tests/helpers/` avoids duplicating the regex across test files.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-core-logger-tests*
*Context gathered: 2026-03-24*

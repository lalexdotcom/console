# Phase 3: Browser, TTY & Spinner Tests — Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate environment-specific rendering and spinner lifecycle across all three
runtime targets: browser devtools, Node console (non-TTY), and Node TTY.

This means:
- **Browser (CORE-07, CORE-08, SPIN-09):** logger output uses `%c` CSS format
  strings, correct console method routing, `console.groupCollapsed` for
  TRACE_LEVELS, and the browser spinner produces CSS-styled icon badges.
- **Console spinner (SPIN-01..06, SPIN-08):** lifecycle methods (start → update
  → success / fail / stop) and their options (autoStart, exec, duration,
  progress) all work when `isNodeTTY=false` (CI / pipe mode). Console renderer
  emits ANSI icon badges line-by-line — no cursor control.
- **TTY spinner (SPIN-07):** TTY renderer manages cursor, multi-spinner layout,
  and the log queue, all while `isNodeTTY=true`.

**Out of scope:** Node console format tests (json / logfmt / pretty) — covered
in Phase 2. Worker proxy — covered in Phase 4.
</domain>

<decisions>
## Implementation Decisions

### Timer Control in Spinner Tests (SPIN-01..06, SPIN-07)
- **D-01:** Use `rs.useFakeTimers()` **per describe-block** for any test that
  needs to advance spinner ticks.
  ```ts
  beforeAll(() => rs.useFakeTimers());
  afterAll(() => rs.useRealTimers());
  ```
  Between the spinner `start()` call and the lifecycle assertion, advance time
  with `rs.advanceTimersByTime(interval + SPINNER_INTERVAL_JITTER + 10)` to
  guarantee at least one tick fires deterministically.
- **D-02:** `autoStart: false` tests do NOT call `spinner.start()` before
  the assertion — they check that zero output lines were emitted after
  construction.

### TTY Environment Simulation (SPIN-07)
- **D-03:** TTY-specific tests live in `tests/tty/main/spinner-tty.test.ts`
  (already included in the rstest `node` project via `tests/tty/**`).
- **D-04:** Make `isNodeTTY = true` at the top of `spinner-tty.test.ts` using
  the hoisted-mock pattern:
  ```ts
  const env = rs.hoisted(() => ({ isNodeTTY: true }));
  rs.mock('../../../src/utils/env', async () => {
    const actual = await rs.importActual<typeof import('../../../src/utils/env')>(
      '../../../src/utils/env',
    );
    return { ...actual, isNodeTTY: true };
  });
  ```
  This intercepts the module before any import resolves, so
  `selectSpinnerFactory()` picks `createTTYSpinner` and `emit` routes to
  `emitTTY`. The mock is scoped to this file only.

### Test File Organisation
- **D-05:** Following Phase 2's one-file-per-requirement-group convention:
  - `tests/node/main/spinner-node.test.ts` — SPIN-01..06, SPIN-08
  - `tests/tty/main/spinner-tty.test.ts` — SPIN-07
  - `tests/browser/main/browser.test.ts` — CORE-07, CORE-08, SPIN-09
- **D-06:** The existing `tests/browser/main/smoke.test.ts` is left untouched.

### Browser Console Capture (CORE-07, CORE-08, SPIN-09)
- **D-07:** Do NOT use `captureAll()` in browser tests — there is no
  `process.stdout`. Instead use `rs.spyOn`:
  ```ts
  const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
  const groupSpy = rs.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
  ```
  Call `spy.mockClear()` in `beforeEach`. After the logger call, inspect
  `spy.mock.calls` directly.
- **D-08:** CORE-07 assertion pattern: the first argument of a `console.log`
  (or `console.debug` for verb/debug/wth) call must contain `'%c'`, confirming
  CSS-styled output.
- **D-09:** CORE-08 assertion pattern: for any TRACE_LEVELS call (emerg, alert,
  crit, error, warn) verify `groupSpy` was called (not `logSpy.mock.calls` for
  the grouped call). Verify `console.groupEnd` was also called.

### Console Spinner — Lifecycle Approach (SPIN-01..06, SPIN-08)
- **D-10:** Use the public API: `L.scope('spin-test-01').info.spin('label')`.
  Because `isNodeTTY=false` in CI, `selectSpinnerFactory()` returns
  `createConsoleSpinner` automatically — no mocking needed.
- **D-11:** Capture output via `captureAll()`. The console spinner emits each
  tick and the final success/fail line through `dispatch` → `emitConsole` →
  `callOnActiveConsole` → `process.stdout/stderr.write`.
- **D-12:** The `CONSOLE_SPINNER_INTERVAL` constant exported from
  `src/logger/mixins/spinner/console/const.ts` resolves to `500` in dev/test
  mode (`NODE_ENV !== 'production'`). Use it in test timing:
  `rs.advanceTimersByTime(CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10)`.
- **D-13:** `exec()` wraps a Promise — test success path and rejection path
  separately. For the rejection path, wrap `exec()` in a `try/catch` to consume
  the re-thrown error without failing the test.

### Agent's Discretion
- Exact inline snapshot strings (generated on first run)
- Number of tick lines captured before success/fail (≥ 1 is sufficient)
- Specific `beforeEach` / `afterEach` structure for spy cleanup inside each
  describe block
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spinner — Shared Core
- `src/logger/mixins/spinner/sequential.ts` — `createSequentialSpinner`,
  `SpinnerState`, `SpinnerRenderFn`, `formatDuration` — the shared timer loop
  and lifecycle state machine used by all three platform renderers
- `src/logger/mixins/spinner/index.ts` — `createSpinnerMixin`,
  `selectSpinnerFactory`, `noopSpinner`, `makeExecFn` — factory routing
  (`isNodeTTY` → TTY, else Node → console, else browser)
- `src/logger/mixins/spinner/const.ts` — `SPINNER_INTERVAL_JITTER` (±150ms)

### Spinner — Platform Renderers
- `src/logger/mixins/spinner/console/index.ts` — `createConsoleSpinner`
- `src/logger/mixins/spinner/console/const.ts` — `CONSOLE_SPINNER_INTERVAL`
  (500ms in dev/test, 5000ms in prod)
- `src/logger/mixins/spinner/tty/index.ts` — `createTTYSpinner`
- `src/logger/mixins/spinner/tty/renderer.ts` — `ttyRenderer` singleton,
  `renderProgressBar`, `renderProgressLabel`
- `src/logger/mixins/spinner/tty/const.ts` — `TTY_SPINNER_INTERVAL` (150ms)
- `src/logger/mixins/spinner/browser/index.ts` — `createBrowserSpinner`
- `src/logger/mixins/spinner/browser/const.ts` — `BROWSER_SPINNER_INTERVAL`
  (500ms in dev, 5000ms in prod)

### Prefix / Render Pipeline
- `src/logger/prefix/render.ts` — `renderBrowserPrefix` (builds `[format, ...css]`
  array), `renderConsolePrefix`, `renderTTYPrefix`
- `src/logger/prefix/serialize.ts` — not used in this phase (console-format
  only tests are Phase 2)

### Logger Core
- `src/logger/index.ts` — `emitConsole` (browser + Node non-TTY path),
  `emitTTY`, `LEVEL_METHODS` map, `TRACE_LEVELS` usage in `emitConsole`
  (`console.groupCollapsed` branch)
- `src/utils/env.ts` — `isNodeTTY`, `isBrowser`, `isNode` — module constants
  mocked in TTY tests via `rs.hoisted() + rs.mock()`

### Test Infrastructure (from Phase 2)
- `tests/helpers/capture.ts` — `captureAll()`, `captureStdout()` — used in
  Node spinner tests
- `tests/helpers/reset.ts` — registered as setupFile; clears registry in
  `beforeEach`

### rstest Timer / Mock APIs
- `rs.useFakeTimers()` / `rs.useRealTimers()` — control setTimeout in spinner
  timing tests
- `rs.advanceTimersByTime(ms)` — deterministic tick advance
- `rs.hoisted(fn)` — run code before module resolution (required for
  `rs.mock()` to intercept module-level constants)
- `rs.mock(path, factory)` — replace a module; NOT hoisted on its own
- `rs.spyOn(obj, method)` — used for browser console capture
</canonical_refs>

<deferred>
## Deferred Ideas

None surfaced during discussion.
</deferred>

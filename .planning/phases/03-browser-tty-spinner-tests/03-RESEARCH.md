# Phase 3: Browser, TTY & Spinner Tests — Research

**Researched:** 2026-03-24
**Domain:** rstest browser mode, Node TTY rendering, spinner lifecycle, module mocking
**Confidence:** HIGH (all findings from direct source code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `rs.useFakeTimers()` per describe-block for timer control in spinner tests
- D-02: `autoStart: false` tests check zero output after construction (no `.start()` call)
- D-03: TTY tests in `tests/tty/main/spinner-tty.test.ts`
- D-04: `rs.hoisted() + rs.mock('../../../src/utils/env', ...)` to force `isNodeTTY=true` in TTY tests
- D-05: File layout: `spinner-node.test.ts` (SPIN-01..06, SPIN-08), `spinner-tty.test.ts` (SPIN-07), `browser.test.ts` (CORE-07, CORE-08, SPIN-09)
- D-06: Keep `tests/browser/main/smoke.test.ts` untouched
- D-07: `rs.spyOn(console, 'log')` + `rs.spyOn(console, 'groupCollapsed')` for browser capture; use `spy.mock.calls` directly
- D-08: CORE-07 asserts first arg contains `'%c'`
- D-09: CORE-08 asserts `groupCollapsed` was called (not `logSpy`) for TRACE_LEVELS; also asserts `groupEnd` was called
- D-10: Public API via `L.scope().level.spin()` for console spinner tests
- D-11: `captureAll()` for console spinner output
- D-12: `CONSOLE_SPINNER_INTERVAL = 500ms` in dev/test; advance by `CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10`
- D-13: `exec()` rejection path wrapped in `try/catch`

### Agent's Discretion
- Exact inline snapshot strings (generated on first run)
- Number of tick lines captured before success/fail (≥ 1 is sufficient)
- Specific `beforeEach` / `afterEach` structure for spy cleanup inside each describe block

### Deferred Ideas (OUT OF SCOPE)
- Node console format tests (json / logfmt / pretty) — covered in Phase 2
- Worker proxy — covered in Phase 4
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-07 | Browser output uses `%c` CSS format strings and correct console methods | `renderBrowserPrefix` always emits `%c{text}%c` for styled items when `color=true`; `effectiveMethod` is `console.log` for most levels |
| CORE-08 | TRACE_LEVELS use `console.groupCollapsed` in browser mode | `emitConsole` → `groupCollapsed(...prefixArgs, ...callArgs); log(stack); groupEnd()` for levels where `hasTrace=true` |
| SPIN-01 | Spinner lifecycle: start → update → success/fail/stop | `createSequentialSpinner` state machine: `started`, `stopped` flags, per-state render callbacks |
| SPIN-02 | Stopped spinner is terminal — success/fail after stop is idempotent | `if (stopped) return;` guard at the top of `success()`, `fail()`, and `update()` |
| SPIN-03 | `autoStart: true` starts immediately, `false` requires `.start()` | `if (options.autoStart !== false) spinner.start();` at bottom of `createSequentialSpinner` |
| SPIN-04 | `exec()` wraps promise: resolved → success, rejected → fail + re-throw | `makeExecFn`: awaits factory, calls `spinner.success()` or `spinner.fail()` + `throw e` |
| SPIN-05 | `duration: true` shows elapsed time in success/fail message | `showDuration && elapsedMs > 0 ? ` (+${formatDuration(elapsedMs)})`` appended to text |
| SPIN-06 | `progress: true` enables progress updates via `.update()` | `buildConsoleProgressText` for console, `linear-gradient` CSS for browser |
| SPIN-07 | TTY renderer manages cursor, multi-spinner layout, log queue | `ttyRenderer` singleton: `addSpinner` (hides cursor, starts interval), `enqueueLog`, `tick` (erase→flush→draw) |
| SPIN-08 | Console renderer (non-TTY) emits ANSI icon badges without cursor control | `createConsoleSpinner` → `dispatch` → `emitConsole` → `renderConsolePrefix` → `process.stdout.write` |
| SPIN-09 | Browser renderer uses CSS-styled badges and progress bars | `createBrowserSpinner` → `extraPrefixItems` with CSS → `renderBrowserPrefix` → `%c ... %c` + CSS gradient |
</phase_requirements>

---

## Summary

Phase 3 adds three test files across two rstest projects (node + browser). All source code was inspected directly — every assertion pattern is definitively verified. The main risks are: (1) the module-level `const isTTY = isNodeTTY` in `spinner/index.ts` must be intercepted before the module evaluates; rstest hoists `rs.mock()` before imports which should work, but it is untested in this codebase; (2) the `ttyRenderer` singleton persists state between tests and must be explicitly cleaned up via `ttyRenderer.cleanup()` in `afterEach`; (3) a `tests/tty/main/` directory must be created — it does not exist yet.

**Primary recommendation:** Implement TTY tests defensively — always clean up the renderer, advance timers by at least 160ms for one TTY tick, and strip ANSI codes before text assertions. Use the existing `spyOnConsole()` helper for browser tests instead of `rs.spyOn`, which already captures `groupCollapsed` and `groupEnd`.

---

## 1. Browser Output Pipeline (CORE-07, CORE-08)

### emitConsole browser path (verbatim, from `src/logger/index.ts`)

```
isNode = false → browser mode

prefixArgs = renderBrowserPrefix(prefix, color)  // → [format, ...cssArgs]

effectiveMethod:
  verb/debug/wth levels → console.debug  (method === activeConsole.debug)
  all other levels     → console.log

TRACE_LEVELS (emerg, alert, crit, error, warn):
  trace = true  (hasTrace=true AND callerOverride=undefined)
  stackContent = getCallerStackTrace() ?? '(no stack available)'  // always a string
  → activeConsole.groupCollapsed(...prefixArgs, ...callArgs)
  → activeConsole.log(stackContent)
  → activeConsole.groupEnd()

Non-TRACE_LEVELS without stack option:
  trace = false, hasTrace = false, stackContent = null
  → effectiveMethod.apply(activeConsole, [...prefixArgs, ...callArgs])
```

**TRACE_LEVELS set** (from `src/levels.ts`):
```ts
new Set(['emerg', 'alert', 'crit', 'error', 'warn'])
```
`error` and `warn` are already included — ADJ-01 was completed in Phase 1.

### renderBrowserPrefix output (from `src/logger/prefix/render.ts`)

- **Level item** (always present): `%c{label}%c` + level CSS string + `''`
- **Icon item**: `%c{text}%c` + `buildIconBadgeCss(color)` + `''`
  - `buildIconBadgeCss`: `border-radius:50%;color:white;font-weight:bold;padding:0px 3px;aspect-ratio:1/1;font-size:0.875em;` (+ optional `background-color:{color};` prefix)
- **Text item with css**: `%c[{text}]%c` (badge) or `%c{text}%c` (plain) + css + `''`
- **Date item**: plain text appended to format string, no CSS
- **Caller item**: `(value)` inline if not `structuredOnly`
- Returns `[format, ...cssArgs]` — spread as leading args to `console.*` call
- Returns `[format]` (no cssArgs) if color=false or no styled items

### LEVEL_METHODS map (from `src/logger/index.ts`)

| Level | console method | effectiveMethod in browser |
|-------|---------------|---------------------------|
| emerg, alert, crit, error | `console.error` | `console.log` (via groupCollapsed anyway) |
| warn | `console.warn` | `console.log` (via groupCollapsed anyway) |
| notice, success, info | `console.info` | `console.log` |
| verb, debug, wth | `console.debug` | `console.debug` |

### Test capture strategy

Use `tests/helpers/console-spy.ts` → `spyOnConsole()`. It already intercepts:
`log, info, debug, warn, error, groupCollapsed, groupEnd`.

**Preferred over `rs.spyOn`** because:
- Already exists and tested
- Captures all needed methods including `groupEnd`
- Synchronous callback pattern matches logger dispatch

```ts
import { spyOnConsole } from '../../helpers/console-spy';

const calls = spyOnConsole(() => L.info('hello'));
// calls[0] = { method: 'log', args: ['%c INFO %c', '<css>', '', 'hello'] }
```

**CORE-07 assertion** — first arg must contain `'%c'`:
```ts
const calls = spyOnConsole(() => L.info('test'));
const logCall = calls.find(c => c.method === 'log');
expect(logCall?.args[0]).toContain('%c');
```

**CORE-08 assertion** — groupCollapsed is called, then groupEnd:
```ts
const calls = spyOnConsole(() => L.error('oops'));
const methods = calls.map(c => c.method);
expect(methods).toContain('groupCollapsed');
expect(methods).toContain('groupEnd');
// groupCollapsed args also contain '%c'
const gc = calls.find(c => c.method === 'groupCollapsed')!;
expect(gc.args[0]).toContain('%c');
```

---

## 2. Console Spinner Lifecycle (SPIN-01..06, SPIN-08)

### Architecture

```
L.scope('x').info.spin('label', options)
  → createSpinnerMixin → selectSpinnerFactory()
    (isNodeTTY=false in CI) → createConsoleSpinner
      → createSequentialSpinner(cfg)
        → if autoStart !== false: spinner.start()
```

### createSequentialSpinner state machine (from `src/logger/mixins/spinner/sequential.ts`)

```
State variables:
  started: boolean = false
  stopped: boolean = false  ← terminal flag
  startTime: number = 0
  currentText: string
  currentOpts: SpinnerUpdateOptions | undefined
  timeoutId: ReturnType<typeof setTimeout> | undefined

start():
  if (started) return  ← idempotent
  started = true; startTime = Date.now()
  render('running', text, 0, opts, null)   ← immediate render
  scheduleTick()                            ← chain of setTimeout

scheduleTick():
  if (stopped) return  ← no-ops after stop
  timeoutId = setTimeout(() => {
    if (stopped) return
    render('running', text, elapsedMs(), opts, null)
    scheduleTick()
  }, jitter(interval))   ← interval ± JITTER

update(t, opts):
  if (stopped) return   ← idempotent in terminal state
  currentText = t; currentOpts = opts

success(t?, opts?):
  if (stopped) return   ← SPIN-02: idempotent
  stopped = true; clearTimeout(timeoutId)
  resolveSuccessProgress(opts, currentOpts)  ← 100% on success if progress was active
  render('success', text, elapsedMs(), opts, null)

fail(t?, opts?):
  if (stopped) return   ← SPIN-02: idempotent
  stopped = true; clearTimeout(timeoutId)
  render('fail', text, elapsedMs(), opts, null)

stop():
  stopped = true; clearTimeout(timeoutId)
  ← no render emitted, just terminates
```

### Console renderer output format (from `src/logger/mixins/spinner/console/index.ts`)

Each render call → `dispatch(level, [text], { extraPrefixItems, stackOffset })`.
Output flows: `dispatch` → `emit` → `emitConsole` → `renderConsolePrefix` → `callOnActiveConsole` → `process.stdout.write` or `process.stderr.write`.

`renderConsolePrefix` renders icon items as `[ ${text} ]`.

So a running tick line looks like: `[ ⋯ ] My spinner text\n`

Icons per state:
| State | Icon | Color |
|-------|------|-------|
| running | `⋯` | dodgerblue |
| success | `✔` | green |
| fail | `✖` | red |

**With progress** (`opts.progress != null`): `buildConsoleProgressText` is used instead of icon, rendering `[●●●●----] (50%) My text\n`.

### Timer constants

```ts
CONSOLE_SPINNER_INTERVAL = 500  // ms, when NODE_ENV !== 'production'
SPINNER_INTERVAL_JITTER   = 150  // ±ms applied to interval

// Minimum advance to guarantee at least one tick:
advance = 500 + 150 + 10 = 660ms
rs.advanceTimersByTime(CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10)
```

### autoStart behavior (SPIN-03)

```ts
// autoStart implicit (default true): spinner.start() called inside createSequentialSpinner
const sp = L.scope('s').info.spin('label');
// → immediately emits first running render, schedules tick

// autoStart: false — no start() called
const sp = L.scope('s').info.spin('label', { autoStart: false });
// → zero output lines until sp.start() is explicitly called
```

### duration option (SPIN-05)

```ts
const showDuration = options.duration ?? false;
const duration = showDuration && elapsedMs > 0 ? ` (+${formatDuration(elapsedMs)})` : '';
// formatDuration: ms < 1000 → '${ms}ms', else '${(ms/1000).toFixed(3)}s'
// duration is appended to text: `${t}${duration}` passed to dispatch
```

### progress option (SPIN-06)

```ts
// options.progress: true enables progress tracking
// update(t, { progress: 0.5 }) or update(t, { progress: { done: 5, total: 10 } })

// Progress bar chars:
CONSOLE_PROGRESS_BAR_DONE_CHAR = '●'
CONSOLE_PROGRESS_BAR_BACKGROUND_CHAR = '-'
BAR_WIDTH = 8

// Format: [●●●●----] (50%) or [●●●●●●●●] (5/10)
// On success: resolveSuccessProgress forces progress to 1 (ratio→1, {done:total,total})
```

### exec() (SPIN-04) — from `src/logger/mixins/spinner/index.ts`

```ts
export function makeExecFn(spinFn: LogMethod['spin']) {
  return async <T>(promiseOrFactory, options?) => {
    const label = options?.label ?? 'Exec';
    const factory = typeof promiseOrFactory === 'function'
      ? promiseOrFactory : () => promiseOrFactory;
    const spinner = spinFn(label, { duration: true });  // autoStart=true by default
    spinner.start();  // explicit second start() is idempotent
    try {
      const result = await factory();
      spinner.success(label);
      return result;
    } catch (e) {
      spinner.fail(e instanceof Error ? `${label}: ${e.message}` : label);
      throw e;  // ← re-throws: test MUST catch this
    }
  };
}
```

**SPIN-04 test pattern (rejection path):**
```ts
// D-13: wrap exec() in try/catch
await expect(
  L.scope('s').info.exec(Promise.reject(new Error('boom')))
).rejects.toThrow('boom');
// Verify captureAll saw a fail line with ✖ icon after awaiting
```

### captureAll() for async (SPIN-04, exec)

`captureAll()` is synchronous. For async exec tests, need to use a different approach:
capture before/after by storing a reference or use a real Promise + check output after await.

**Pattern:**
```ts
const out: string[] = [];
const orig = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: string | Uint8Array) => {
  out.push(typeof chunk === 'string' ? chunk : '');
  return true;
} as typeof process.stdout.write;

try {
  await L.scope('s').info.exec(Promise.resolve('ok'), { label: 'Task' });
} finally {
  process.stdout.write = orig;
}
// out contains tick lines + success line
```

---

## 3. TTY Spinner & Renderer (SPIN-07)

### createTTYSpinner (from `src/logger/mixins/spinner/tty/index.ts`)

TTY spinner does NOT use `createSequentialSpinner`. It routes everything through `dispatch` with `ttySpinner` signals.

```
start() / autoStart=true:
  dispatch(level, [text], { stackOffset: null,
    ttySpinner: { action: 'register', id: Symbol(), frames: ['⠋','⠙',...], color:'cyan' }
  })
  → emitTTY → ttyRenderer.addSpinner(state)
  → hides cursor (\x1b[?25l), starts setInterval(tick, 150)

update(text, opts):
  ttyRenderer?.updateText(id, text)     // direct, no dispatch
  ttyRenderer?.updateIcon(id, icon)
  ttyRenderer?.updateProgress(id, ratio, raw)

success/fail:
  stopSpinner(iconDef, message, outcome)
  → dispatch(level, [text], { extraPrefixItems: [icon or bar], ttySpinner: {action:'stop', id} })
  → emitTTY → ttyRenderer.removeSpinner(id) → then writes final line directly

stop():
  stopSpinner with TTY_DEFAULT_FAIL_ICON, no message, outcome='stop'
```

### ttyRenderer singleton (from `src/logger/mixins/spinner/tty/renderer.ts`)

- Stored on `globalThis['$tty-renderer']`
- Created on first `import` of `renderer.ts` (if `process.stdout` exists)
- `process.on('exit', cleanup)` registered at creation time

**Key methods:**
| Method | Effect |
|--------|--------|
| `addSpinner(state)` | Adds to spinners Map, hides cursor, starts setInterval if first |
| `removeSpinner(id)` | Removes from Map; if last spinner: stopInterval, eraseSpinners, flushPending, showCursor |
| `enqueueLog(line)` | Pushes to `pendingQueue` |
| `tick()` | `eraseSpinners()` → `flushPending()` → `drawSpinners()` |
| `cleanup()` | stopInterval, eraseSpinners, flushPending, showCursor, `spinners.clear()` |
| `isActive()` | `spinners.size > 0` |

**Cursor control ANSI sequences:**
```
Hide: \x1b[?25l  (written on addSpinner when not already hidden)
Show: \x1b[?25h  (written on removeSpinner if last, or cleanup)
```

**Erase sequence:**
```
\x1b[${N}A\x1b[0J  (move up N lines, erase to end of screen)
```

### TTY interval

```ts
TTY_SPINNER_INTERVAL = 150  // ms (NOT affected by NODE_ENV)

// Minimum advance for one tick:
rs.advanceTimersByTime(160)  // just over 150ms
```

### Log queue behavior

```ts
// When spinners are active:
write(line) calls ttyRenderer.enqueueLog(line)
// Queued lines flush on the NEXT tick() call (via flushPending)

// Pattern for testing enqueueLog:
// 1. Start spinner (hides cursor, starts interval)  
// 2. Call L.info('log while spinning') — goes to pendingQueue
// 3. rs.advanceTimersByTime(160) — triggers tick → flushPending → log appears in stdout
// 4. spinner.success() — removes spinner, final line written directly
```

### Capturing TTY output

Since all TTY output goes through `process.stdout.write`, use `captureStdout()`:

```ts
import { captureStdout } from '../../helpers/capture';  // wait — not exported from capture.ts
```

> **Important:** `captureStdout` is in `tests/helpers/stdout.ts`, NOT in `capture.ts`.
> `captureAll()` returns `{ stdout, stderr }` — use `captureAll().stdout` for TTY output.
> Alternatively import directly from `../../helpers/stdout`.

TTY output contains ANSI escape codes. For text assertions, use `stripVTControlCharacters` (Node built-in) or assert on raw sequences:

```ts
import { stripVTControlCharacters } from 'node:util';

const { stdout } = captureAll(() => { ... });
const clean = stdout.map(s => stripVTControlCharacters(s));
```

### afterEach cleanup — CRITICAL

The `ttyRenderer` singleton's state (`spinners`, `intervalId`, `cursorHidden`) persists across tests. **Must call `ttyRenderer.cleanup()` in `afterEach`** to prevent state leakage.

```ts
import { ttyRenderer } from '../../../src/logger/mixins/spinner/tty/renderer';

afterEach(() => {
  ttyRenderer?.cleanup();
});
```

**Note:** `reset.ts` does NOT clear `globalThis['$tty-renderer']` — only the logger registry is reset.

### Module mock pattern for isNodeTTY

`spinner/index.ts` captures `isNodeTTY` as a module-level constant:
```ts
import { isNode, isNodeTTY } from '../../../utils/env';
const isTTY = isNodeTTY;  // captured at module evaluation time
```

For `selectSpinnerFactory()` to return `createTTYSpinner`, the mock must be applied BEFORE this module evaluates. rstest hoists `rs.mock()` calls, so the mock factory runs before any imports in the test file resolve.

**D-04 pattern (verbatim):**
```ts
const env = rs.hoisted(() => ({ isNodeTTY: true }));
rs.mock('../../../src/utils/env', async () => {
  const actual = await rs.importActual<typeof import('../../../src/utils/env')>(
    '../../../src/utils/env'
  );
  return { ...actual, isNodeTTY: true };
});
```

Note: `env` variable is declared via `rs.hoisted` but not used inside the factory in the D-04 example — the factory returns the mock value directly. The `rs.hoisted` pattern is needed when the factory needs to reference a variable that was declared in the outer test scope. For simple TTY mocking, the `{ ...actual, isNodeTTY: true }` return is sufficient.

**rs.hoisted signature:** `rs.hoisted<T>(fn: () => T): T` — evaluates `fn` at hoist time (before imports), returns the result.

---

## 4. Browser Spinner (SPIN-09)

### createBrowserSpinner (from `src/logger/mixins/spinner/browser/index.ts`)

Uses `createSequentialSpinner` (same as console spinner). All output goes through `dispatch` → `emitConsole` browser path → `activeConsole.*`.

**BROWSER_SPINNER_INTERVAL:**
```ts
typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 500 : 5_000
```
In rstest browser mode, `import.meta.env.DEV = true`, so interval = **500ms**.

Advance timing: same as console spinner → `500 + 150 + 10 = 660ms`.

### Icon output (no progress)

```ts
extraPrefixItems = [{ type: 'icon', text: iconContent, color: def.color }]
```

`renderBrowserPrefix` renders icon items as:
```
format += `%c${iconContent}%c`
cssArgs.push(buildIconBadgeCss(def.color), '')
```

Full output to `console.log`: `['%c INFO %c %c⋯%c label', levelCss, '', iconBadgeCss, '']`

### Progress bar output (with progress)

```ts
const barCss = `background:linear-gradient(to right,${c} 0%,${c} ${pct}%,lightgrey ${pct}%,lightgrey 100%);padding:0px 48px;line-height:0.5;border-radius:2px;`;
const labelCss = `color:${c};font-weight:bold;`;
extraPrefixItems = [
  { type: 'text', text: ' ', css: barCss },
  { type: 'text', text: label, css: labelCss },
]
```

`renderBrowserPrefix` renders text items with css:
- `' '` item: `%c %c` + barCss + `''`
- label item: `%c{label}%c` + labelCss + `''`

### SPIN-09 capture pattern

```ts
const calls = spyOnConsole(() => {
  rs.advanceTimersByTime(BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10);
  // But advanceTimersByTime is sync — spinner must already be ticking
});

// Better pattern with fake timers:
const sp = L.scope('s').info.spin('label', { progress: true });
// sp started immediately (autoStart: true)
sp.update('50%', { progress: 0.5 });
const calls = spyOnConsole(() => {
  sp.success('done');
});
```

Wait - for browser spinner ticks to be captured, fake timers must trigger setTimeout.
The ticks run inside setTimeout chains (sequential). Capture pattern:

```ts
beforeAll(() => rs.useFakeTimers());
afterAll(() => rs.useRealTimers());

test('browser spinner emits %c on tick', () => {
  const allCalls: ConsoleCall[] = [];
  const origLog = console.log;
  // Use spyOnConsole for the start (immediate render)
  const startCalls = spyOnConsole(() => {
    L.scope('spin-browser').info.spin('loading');
  });
  // Advance time for a tick (starts inside setTimeout)
  const tickCalls = spyOnConsole(() => {
    rs.advanceTimersByTime(BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10);
  });
  expect([...startCalls, ...tickCalls].some(c => c.method === 'log' && typeof c.args[0] === 'string' && c.args[0].includes('%c'))).toBe(true);
});
```

---

## 5. Test Infrastructure

### captureAll() (from `tests/helpers/capture.ts`)

```ts
export function captureAll(fn: () => void): { stdout: string[]; stderr: string[] }
```

Intercepts `process.stdout.write` AND `process.stderr.write`. Returns arrays of string chunks. Works for all synchronous logger output. Does NOT work in browser mode (no `process`).

**For async (exec()):** Cannot use `captureAll(() => await ...)` since it's synchronous. Must manually wrap stdout intercept around an async block, or check output after awaiting.

### spyOnConsole() (from `tests/helpers/console-spy.ts`)

```ts
export function spyOnConsole(fn: () => void): ConsoleCall[]
// ConsoleCall = { method: string, args: unknown[] }
// Intercepts: log, info, debug, warn, error, groupCollapsed, groupEnd
```

Use in browser tests (no process.stdout). Also usable in node tests when testing `patch()/bypass()`.

### captureStdout() (from `tests/helpers/stdout.ts`)

```ts
export function captureStdout(fn: () => void): string[]
```

stdout only. Useful when testing TTY output (ANSI-heavy, no stderr output from TTY renderer).

### reset.ts (global setupFile)

Runs `beforeEach` to reset the logger registry:
- Clears `registry.scopes`
- Deletes `registry.exclusive`
- Resets `registry.format = 'json'`
- Clears `registry.rootOptions`

Does **NOT** reset:
- `ttyRenderer` singleton state (spinners Map, intervalId, cursorHidden)
- `activeConsole` (bypass/restore state — only cleared by calling `restore()`)
- Module-level constants like `isTTY`

### rstest config verification

From `rstest.config.ts`:
```ts
{
  name: 'node',
  include: ['tests/node/**/*.test.ts', 'tests/tty/**/*.test.ts'],  // ✓ tty included
  setupFiles: ['./tests/helpers/reset.ts'],
  disableConsoleIntercept: true,
}
```

`tests/tty/` directory does NOT currently exist → must create `tests/tty/main/` on plan execution.

### Existing test file patterns

From `tests/node/main/levels.test.ts` and `mixins.test.ts`:
```ts
import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../helpers/capture';
// reset.ts is registered globally — no import needed

describe('Description (REQ-ID)', () => {
  test('behavior description', () => {
    L.format = 'json';
    // ...
    const { stdout } = captureAll(() => L.info('msg'));
    expect(stdout).toHaveLength(1);
  });
});
```

For spinner tests requiring fake timers, the pattern extends to:
```ts
import { describe, expect, test, beforeAll, afterAll, rs } from '@rstest/core';
// Note: 'rs' is the Rstest utility object (like 'vi' in Vitest)
```

From browser `smoke.test.ts`:
```ts
import { expect, test } from '@rstest/core';
// No captureAll — no process.stdout in browser
test('rstest runs in browser environment', () => {
  expect(typeof document).toBe('object');
  expect(typeof window).toBe('object');
});
```

---

## 6. Module Mock Pattern

### rs.hoisted + rs.mock + rs.importActual

**API signatures** (from `@rstest/core/dist/index.d.ts`):
```ts
rs.hoisted: <T = unknown>(fn: () => T) => T
rs.mock<T>(moduleName: string, factoryOrOptions?: MockFactory<T> | MockModuleOptions): void
rs.importActual: <T>(path: string) => Promise<T>
```

`rs.mock()` is hoisted to the top of the compiled test file before imports.
`rs.hoisted()` is used to declare variables that are referenced inside mock factories — the returned value is available at hoist time before imports resolve.

**Complete TTY mock pattern** (D-04):
```ts
import { rs, describe, beforeAll, afterAll, test, expect, type } from '@rstest/core';

// Declare hoisted variable (optional if factory doesn't need outer refs)
const _env = rs.hoisted(() => ({ isNodeTTY: true as boolean }));

// Mock is auto-hoisted by rstest before imports are resolved:
rs.mock('../../../src/utils/env', async () => {
  const actual = await rs.importActual<typeof import('../../../src/utils/env')>(
    '../../../src/utils/env'
  );
  return { ...actual, isNodeTTY: true };
});

// Normal imports follow — they see the mocked modules:
import { L } from '../../../src';
import { ttyRenderer } from '../../../src/logger/mixins/spinner/tty/renderer';
```

### Compatibility with Rspack

rstest with `@rstest/adapter-rslib` (Rspack-backed) should support `rs.mock()` hoisting because:
1. rstest transforms test files to hoist `rs.mock()` calls before static imports are analyzed
2. The mock replaces the module in rstest's module registry before any importing module evaluates

**However** — `const isTTY = isNodeTTY` in `spinner/index.ts` is a concern:
- If Rspack inlines the value of `isNodeTTY` at bundle-compile time (as a dead-code elimination optimization), the mock would have no effect
- In development mode (`NODE_ENV=test`), Rspack typically does NOT inline module exports as constants — live bindings are preserved
- Confidence: MEDIUM — should work, but is unverified in this codebase

**Fallback strategy (if mock doesn't work):** Import `createTTYSpinner` and `ttyRenderer` directly and test them without going through `selectSpinnerFactory`. This bypasses the mock concern entirely, though it deviates from D-10 (public API).

### No existing rs.hoisted usage

There are **no existing uses of `rs.hoisted` or `rs.mock`** in the test suite — this will be the first mock in the codebase. If it fails, the TTY test file would need the `createTTYSpinner` direct import approach.

---

## 7. Risks & Constraints

### RISK-1: `const isTTY = isNodeTTY` module capture [MEDIUM]

**What:** `spinner/index.ts` evaluates `const isTTY = isNodeTTY` at module load. If Rspack's bundler sees this as a compile-time constant, the runtime mock won't affect it.

**Mitigation:** rstest operates at module-evaluation level, not compile-output level. In test mode, Rspack should NOT inline imported values. The rs.mock + rs.hoisted pattern from D-04 should work.

**Fallback:** If `selectSpinnerFactory()` returns `createConsoleSpinner` despite mock, test createTTYSpinner directly:
```ts
import { createTTYSpinner } from '../../../src/logger/mixins/spinner/tty';
// Test the TTY API directly without going through the public L.spin() entry point
```

### RISK-2: ttyRenderer singleton state leak [HIGH — managed]

**What:** `ttyRenderer` is stored on `globalThis['$tty-renderer']`. Its internal state (`spinners`, `intervalId`, `cursorHidden`, `pendingQueue`) persists between tests. A failed test that doesn't clean up the renderer will corrupt subsequent tests.

**Mitigation:** Call `ttyRenderer?.cleanup()` in `afterEach` for all TTY test describe-blocks. Import `ttyRenderer` directly from `src/logger/mixins/spinner/tty/renderer`.

### RISK-3: Fake timers in browser environment [LOW]

**What:** `rs.useFakeTimers()` replaces `setTimeout/setInterval`. In browser mode (rstest Playwright project), fake timers should work in the page context. The browser spinner uses `setTimeout` chains (not `setInterval`).

**Mitigation:** rstest browser mode supports fake timers (based on Vitest's @sinonjs/fake-timers). The `BROWSER_SPINNER_INTERVAL = 500ms` in DEV mode gives adequate timing margin.

### RISK-4: tests/tty/main/ directory missing [LOW — known]

**What:** `tests/tty/main/` does not exist. rstest config already includes `tests/tty/**/*.test.ts` but the directory must be created.

**Mitigation:** Wave 0 task creates `tests/tty/main/spinner-tty.test.ts` (creating the directory implicitly).

### RISK-5: async captureAll for exec() [LOW — managed]

**What:** `captureAll()` is synchronous. `exec()` returns a Promise — wrapping `await exec()` inside `captureAll(() => ...)` won't work.

**Mitigation:** Manually wrap `process.stdout.write` before/after the `await exec(...)` call using the same try/finally pattern that `captureAll` uses internally.

### RISK-6: rs.hoisted variable unused in D-04 pattern [LOW — clarification]

**What:** The D-04 pattern declares `const env = rs.hoisted(...)` but doesn't actually use `env` inside the mock factory (the factory returns `{ ...actual, isNodeTTY: true }` directly). This is valid — the hoisted value isn't needed when the mock factory has no outer variable references.

**Mitigation:** Use the simpler form without `rs.hoisted` unless the factory actually needs an outer-scope variable.

---

## 8. Validation Architecture

`nyquist_validation: false` in `.planning/config.json` → **Validation Architecture section skipped.**

Requirements are validated by direct behavioral assertion:

| Req | Observable behavior to assert |
|-----|-------------------------------|
| CORE-07 | `spyOnConsole(() => L.info('x'))[0].args[0]` contains `'%c'` |
| CORE-08 | `spyOnConsole(() => L.error('x'))` methods include `'groupCollapsed'` and `'groupEnd'` |
| SPIN-01 | `captureAll` sees running tick lines, then success/fail line with correct icon |
| SPIN-02 | After `sp.stop()`, calling `sp.success()` produces zero additional output |
| SPIN-03 | After construction with `autoStart:false`, `captureAll result = []` before `.start()` |
| SPIN-04 | After `exec(Promise.resolve())`, stdout contains success icon; after `exec(Promise.reject())`, stdout contains fail icon AND error is thrown |
| SPIN-05 | Success/fail line text contains `(+Nms)` or `(+N.NNNs)` pattern |
| SPIN-06 | Tick line contains `●` and `(50%)` (or `done/total` format) |
| SPIN-07 | stdout contains `\x1b[?25l` after start; spinner text appears in tick output; `\x1b[?25h` after cleanup; enqueued log appears after tick advance |
| SPIN-08 | Console renderer tick lines contain `[ ⋯ ]`; success line contains `[ ✔ ]`; stderr receives emerg/alert/crit/error/warn spinner output |
| SPIN-09 | `spyOnConsole` shows `log` call with args containing `%c` (CSS gradient or icon badge) |

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `src/logger/index.ts` — `emitConsole`, `LEVEL_METHODS`, `emitTTY`, `prepareLog`
- `src/logger/prefix/render.ts` — `renderBrowserPrefix`, `buildIconBadgeCss`
- `src/levels.ts` — `TRACE_LEVELS`, `LEVEL_METHODS`
- `src/logger/mixins/spinner/sequential.ts` — full lifecycle state machine
- `src/logger/mixins/spinner/console/index.ts` + `const.ts` — console renderer + intervals
- `src/logger/mixins/spinner/tty/index.ts` — `createTTYSpinner`
- `src/logger/mixins/spinner/tty/renderer.ts` — `ttyRenderer` singleton, full renderer
- `src/logger/mixins/spinner/tty/const.ts` — `TTY_SPINNER_INTERVAL = 150ms`
- `src/logger/mixins/spinner/browser/index.ts` + `const.ts` — browser renderer + CSS format
- `src/logger/mixins/spinner/index.ts` — `selectSpinnerFactory`, `makeExecFn`
- `src/logger/mixins/spinner/const.ts` — `SPINNER_INTERVAL_JITTER = 150`
- `src/utils/env.ts` — `isNodeTTY`, `isNode`, `isBrowser`
- `src/logger/const.ts` — `DEFAULT_LOGGER_OPTIONS` (color: true, pad: isNode)
- `tests/helpers/capture.ts` — `captureAll`
- `tests/helpers/stdout.ts` — `captureStdout`
- `tests/helpers/console-spy.ts` — `spyOnConsole` (already captures groupCollapsed/groupEnd)
- `tests/helpers/reset.ts` — registry reset scope
- `rstest.config.ts` — project include patterns (tty/** confirmed)
- `@rstest/core/dist/index.d.ts` — `rs.hoisted`, `rs.mock`, `rs.importActual` signatures
- `.planning/config.json` — `nyquist_validation: false`

---

## RESEARCH COMPLETE

**Phase:** 3 — Browser, TTY & Spinner Tests
**Confidence:** HIGH

### Key Findings
1. `renderBrowserPrefix` always produces `%c{text}%c` format strings for styled items — CORE-07 assertion is straightforward
2. TRACE_LEVELS path in `emitConsole` unconditionally calls `groupCollapsed + log(stack) + groupEnd` — `spyOnConsole` helper already captures all three methods
3. `createSequentialSpinner` state machine has clear terminal state via `stopped` flag — all idempotency tests are direct `if (stopped) return` guards
4. TTY spinner does NOT use `createSequentialSpinner` — it routes through `dispatch` with `ttySpinner` signals to the renderer, requiring explicit `afterEach` cleanup
5. `const isTTY = isNodeTTY` module-level capture is a MEDIUM risk — rstest mock hoisting should work but is unverified; direct `createTTYSpinner` import is the fallback
6. `tests/tty/main/` directory must be created — it does not exist yet
7. `spyOnConsole()` helper in `tests/helpers/console-spy.ts` is preferred over `rs.spyOn` for browser tests — it already captures `groupCollapsed` and `groupEnd`

### File Created
`.planning/phases/03-browser-tty-spinner-tests/03-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Browser output pipeline (CORE-07/08) | HIGH | Direct source inspection of emitConsole + renderBrowserPrefix |
| Console spinner lifecycle (SPIN-01..06, SPIN-08) | HIGH | Full sequential.ts + console/index.ts read |
| TTY renderer (SPIN-07) | HIGH | Full renderer.ts read; singleton pattern verified |
| Browser spinner (SPIN-09) | HIGH | Full browser/index.ts + const.ts read |
| Module mock pattern (rs.hoisted) | MEDIUM | API verified; no existing usage in codebase to cross-check |
| Rspack mock compatibility | MEDIUM | Should work based on rstest semantics; unverified in practice |

### Open Questions
1. Does `const isTTY = isNodeTTY` in `spinner/index.ts` survive rstest module mocking? — Should work (rstest hoisting), but needs to be verified on first test run. Fallback is direct `createTTYSpinner` import.
2. Does `rs.useFakeTimers()` in the rstest Playwright browser project intercept `setTimeout` inside the bundled spinner code? — Should work; browser fake timers use @sinonjs/fake-timers page injection.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.

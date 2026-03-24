# Phase 2: Core Logger Tests — Research

**Researched:** 2026-03-24
**Domain:** rstest / @rstest/core • Node.js stream capture • structured log format parsing
**Confidence:** HIGH (all findings verified directly from source code and Phase 1 artifacts)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** One file per requirement group inside `tests/node/main/`. Files:
  `levels.test.ts`, `formats.test.ts`, `prefix.test.ts`, `options.test.ts`,
  `scopes.test.ts`, `mixins.test.ts`, `registry.test.ts`, `console.test.ts`.
- **D-02:** Each file uses `describe()` blocks to group closely related tests.
- **D-03:** The existing `smoke.test.ts` in `tests/node/main/` is left untouched.
- **D-04:** Verify level→method dispatch via a `captureAll()` helper that intercepts
  both `process.stdout.write` and `process.stderr.write` simultaneously.
  Returns `{ stdout: string[], stderr: string[] }`.
- **D-05:** No library APIs (bypass, instrumentation flags) used for dispatch assertions —
  rely solely on stream separation.
- **D-06:** JSON format: `JSON.parse()` the line, assert core fields, `toMatchInlineSnapshot()`.
- **D-07:** logfmt format: parse with a `key=value` regex helper, assert fields, snapshot raw line.
- **D-08:** pretty format: `renderConsolePrefix` produces plain text — assert level badge text,
  snapshot full line.
- **D-09:** Use `L.scope('unique-per-test-name')` for every mixin test; `reset.ts` deletes
  all scopes in `beforeEach` so each test has a fresh scope with a fresh `entries` Map.
- **D-10:** An explicit `key` string must be passed to `L.scope(s).limit(n, key)` in MIX-03
  tests.

### Agent's Discretion

- Helper implementation details for `captureAll` (buffering, TextDecoder for Uint8Array, etc.)
- Exact snapshot strings (generated and committed on first run)
- Whether to share a helper `parseLogfmt(line): Record<string, string>` utility or inline the regex

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | All 11 level methods dispatch to the correct console method | LEVEL_METHODS map verified; stream routing confirmed; captureAll() pattern defined |
| CORE-02 | Level filtering suppresses levels below the configured threshold | `prepareLog` guard: `LEVEL_SEVERITY[level] < LEVEL_SEVERITY[logLevel]` → null |
| CORE-03 | Logger.enabled toggle suppresses all output when false | `prepareLog` guard: `!self.enabled \|\| !registry.root.enabled` → null |
| CORE-04 | JSON format: valid, parseable JSON with correct fields | `serializeJSON` field order and names confirmed from source |
| CORE-05 | logfmt format: valid key=value pairs with correct field ordering | `serializeLogfmt` field order confirmed from source |
| CORE-06 | pretty format: correct prefix structure, no ANSI codes | `renderConsolePrefix` confirmed to produce plain-text brackets only |
| PREFIX-01 | Level badge displays correct label text per level | `LEVEL_DISPLAY` labels and `renderConsolePrefix` `[LABEL]` pattern verified |
| PREFIX-02 | Date prefix produces ISO 8601 timestamp when `date = true` | `getDatePrefix` format and `emitConsole` date-prepend logic verified |
| PREFIX-03 | Caller prefix shows `file:line:col` when `stack = true` | CallerPrefix appended in `prepareLog` when `stack=true`; `structuredOnly=true` for JSON/logfmt |
| PREFIX-04 | Scope name appears in prefix for scoped loggers | `LevelPrefix.scope` populated by `getPrefix` when `state.scope` is set |
| OPT-01 | All option getters/setters read/write correctly | `createCoreLogger` getter/setter pairs verified for: enabled, level, pad, color, date, stack, uid, inspect |
| OPT-02 | Option cascade: own options > root options > defaults | `computeOptions` layer chain verified; 3 layers plus DEFAULT |
| OPT-03 | Level cascading picks the strictest (lowest numeric) | `reduce((a, b) => LEVEL_SEVERITY[a] <= LEVEL_SEVERITY[b] ? a : b)` confirmed |
| OPT-04 | util.inspect integration forwards inspect options | `callArgs.map(a => _inspect(a, inspect))` in `prepareLog` for Node |
| SCOPE-01 | `scope('name')` returns ScopeLogger with all level methods and `scope` property | `createScopeLogger` + `Object.assign(self, ..., { scope: scopeName })` confirmed |
| SCOPE-02 | Same scope name returns cached instance (identity equality) | `registry.scopes[scopeName]` check in `createRootMixin.scope()` confirmed |
| SCOPE-03 | Scope options inherit from root and can be overridden independently | `computeOptions([scopeOptions, rootOptions, DEFAULT])` cascade confirmed |
| SCOPE-04 | Scope mutations do not leak to other scopes or root | Each scope has its own `state.options` object (via `{ ...options }` spread) |
| MIX-01 | `once()` emits exactly once per call-site | `registerIfAbsent(key, 1)` + `entry.count >= entry.max` gate confirmed |
| MIX-02 | `limit(n)` emits exactly n times per call-site | `registerIfAbsent(key, n)` + counter increment confirmed |
| MIX-03 | `limit()` with explicit key groups disparate call-sites | Explicit `key` arg bypasses `getLimitCallerKey()` — confirmed in `createLimitMixin` |
| MIX-04 | `options({...}).level()` applies overrides to one call only, then reverts | `createOneShot` passes `{ options: overrides }` to `emit` — one-shot, no mutation |
| REG-01 | Logger is the same instance across multiple imports | ESM module cache + `registry.root` singleton bootstrap confirmed |
| REG-02 | globalThis registry survives across module loads | `globalThis['$logger-registry']` guard: create once, reuse always — confirmed |
| REG-03 | `exclusive = true` silences all other loggers | `prepareLog`: `registry.exclusive && registry.exclusive !== self → null` confirmed |
| REG-04 | `format` getter/setter reads/writes `registry.format` | `Object.defineProperty` on L with `get/set registry.format` confirmed |
| CONS-01 | `patch()` replaces native console methods | `createRootMixin.patch()` replaces log/info/debug/warn/error confirmed |
| CONS-02 | `unpatch()` restores original console methods | `__originalConsoleMethods` captured at module load; restored by `unpatch()` |
| CONS-03 | `bypass(console)` redirects output to custom console object | `activeConsole = console` in `createRootMixin.bypass()` confirmed |
| CONS-04 | `restore()` reverts bypass to system console | `activeConsole = systemConsole` in `createRootMixin.restore()` confirmed |
</phase_requirements>

---

## Summary

Phase 2 writes 8 test files covering 30 requirements, all exercised through Node non-TTY console capture. The implementation is already complete and stable — this phase produces tests, not production code. All behavioral contracts are derivable directly from the source code read above; no external library research is needed.

The most important technical constraint is **TRACE_LEVELS stream splitting under pretty format**: emerg, alert, crit, error, and warn all call `getCallerStackTrace()` and emit the result via `activeConsole.log` to **stdout** after the main log line lands on **stderr**. This only applies to the **pretty** format path — json and logfmt formats **return early** before the trace logic, so they produce exactly one line to stderr with no stdout spillover. Format tests should therefore default to non-TRACE levels (e.g., `info`, `debug`) and only exercise TRACE_LEVELS explicitly when testing dispatch routing (CORE-01) or explicit pretty+trace combinations.

**Primary recommendation:** Write all 8 test files sharing the same three helpers — `captureAll()`, `parseLogfmt()`, and the existing `reset.ts` / `captureStdout()` — building on the exact patterns established in Phase 1.

---

## Standard Stack

### Core (all already installed — Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@rstest/core` | 0.9.4 | Test runner, `test`/`describe`/`expect` | Already configured in rstest.config.ts |
| `@rstest/adapter-rslib` | 0.2.1 | Build integration | Already in rstest.config.ts |

### No new packages required

All test infrastructure was installed in Phase 1. Phase 2 only adds test files and two helper utilities.

**Test commands (verified from package.json):**
```bash
pnpm test:node   # runs the node project only (fast feedback)
pnpm test        # runs all projects (node + browser)
```

---

## Architecture Patterns

### Recommended Project Structure

```
tests/
├── helpers/
│   ├── stdout.ts          # captureStdout() — Phase 1, existing
│   ├── reset.ts           # beforeEach registry reset — Phase 1, existing
│   ├── console-spy.ts     # browser spy — Phase 1, existing, NOT used in node tests
│   ├── capture.ts         # NEW: captureAll() — stdout + stderr simultaneous capture
│   └── logfmt.ts          # NEW: parseLogfmt() — logfmt line → Record<string, string>
└── node/
    └── main/
        ├── smoke.test.ts   # Phase 1, existing — DO NOT MODIFY
        ├── levels.test.ts  # CORE-01, CORE-02, CORE-03
        ├── formats.test.ts # CORE-04, CORE-05, CORE-06
        ├── prefix.test.ts  # PREFIX-01, PREFIX-02, PREFIX-03, PREFIX-04
        ├── options.test.ts # OPT-01, OPT-02, OPT-03, OPT-04
        ├── scopes.test.ts  # SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04
        ├── mixins.test.ts  # MIX-01, MIX-02, MIX-03, MIX-04
        ├── registry.test.ts # REG-01, REG-02, REG-03, REG-04
        └── console.test.ts # CONS-01, CONS-02, CONS-03, CONS-04
```

### Pattern 1: captureAll() helper

**What:** Wraps `process.stdout.write` AND `process.stderr.write` simultaneously, collects chunks from both, restores both in `finally`.

**When to use:** Dispatch tests (CORE-01), format tests on stderr-routing levels, console patch tests.

```typescript
// tests/helpers/capture.ts
export function captureAll(fn: () => void): { stdout: string[]; stderr: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    err.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return { stdout: out, stderr: err };
}
```

### Pattern 2: parseLogfmt() helper

**What:** Parses a logfmt line into a `Record<string, string>`.

**When to use:** CORE-05 format assertions, PREFIX-* logfmt assertions.

```typescript
// tests/helpers/logfmt.ts

/**
 * Parses a single logfmt line into a key/value record.
 * Handles both bare values (level=info) and quoted values (msg="hello world").
 */
export function parseLogfmt(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match key=value or key="quoted value with spaces"
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const key = match[1];
    const raw = match[2];
    // Strip surrounding quotes and unescape
    result[key] = raw.startsWith('"')
      ? JSON.parse(raw) as string
      : raw;
  }
  return result;
}
```

### Pattern 3: Standard test file header

```typescript
import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import '../../../tests/helpers/reset';        // auto-registers beforeEach reset
import { captureAll } from '../../helpers/capture';
import { parseLogfmt } from '../../helpers/logfmt'; // only in formats/prefix files
```

### Pattern 4: JSON format test shape

```typescript
test('info level produces valid JSON with correct fields', () => {
  L.format = 'json'; // explicit even though reset.ts already sets it
  const { stdout, stderr } = captureAll(() => L.info('hello', { key: 'val' }));
  expect(stderr).toHaveLength(0);           // info → stdout only
  expect(stdout).toHaveLength(1);
  const line = stdout[0].trimEnd();
  const parsed = JSON.parse(line);
  expect(parsed.level).toBe('info');        // console method name
  expect(parsed.severity).toBe('info');     // actual log level
  expect(parsed.msg).toBe('hello');
  expect(parsed.data).toEqual({ key: 'val' });
  expect(typeof parsed.time).toBe('string');
  expect(new Date(parsed.time).toISOString()).toBe(parsed.time); // valid ISO 8601
  expect(line).toMatchInlineSnapshot(`...`); // committed on first run
});
```

### Pattern 5: pretty format test shape

```typescript
test('info level produces plain-text [INFO] badge', () => {
  L.format = 'pretty';
  L.pad = false;   // deterministic label width — no centering padding
  L.color = false; // no ANSI codes needed (renderConsolePrefix is always plain-text)
  const { stdout } = captureAll(() => L.info('msg'));
  expect(stdout[0]).toContain('[INFO]');
  expect(stdout[0]).not.toMatch(/\x1b\[/); // no ANSI escape sequences
  expect(stdout[0].trimEnd()).toMatchInlineSnapshot(`'[INFO] msg'`);
});
```

### Pattern 6: mixin tests with unique scope names

```typescript
// mixins.test.ts
test('once() emits exactly once per call-site', () => {
  const s = L.scope('mix-once-01'); // unique name per test
  const { stdout } = captureAll(() => {
    for (let i = 0; i < 3; i++) {
      s.once().info('repeated');
    }
  });
  expect(stdout).toHaveLength(1);
});
```

### Anti-Patterns to Avoid

- **Using root `L` for mixin tests:** `L.once()` / `L.limit()` use call-site keys derived from the stack. Since `reset.ts` doesn't reset the entries Map (it's in a closure), using the root L across multiple tests in the same file may have stale counters. Always use `L.scope('unique-name')` for mixin tests.
- **Asserting on stderr for json/logfmt TRACE_LEVELS without knowing the field layout:** The log line is in `stderr[0]`, not `stdout[0]`. Always use `captureAll()` for any CORE-01 assertions.
- **Asserting pretty format with pad=true (default):** Padded labels include center-padding whitespace (e.g., `[  INFO   ]` to align with 'WHO CARES?'). Set `L.pad = false` before pretty-format assertions to stabilize snapshots.
- **Not calling `L.unpatch()` / `L.restore()` after CONS tests:** These modify global state that `reset.ts` does NOT reset. Always restore in `afterEach` or `try/finally`.
- **Forgetting `import '../../../tests/helpers/reset'`:** The `beforeEach` only runs if this file is imported. Every new `*.test.ts` file must import it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| logfmt parsing | Custom regex from scratch in each test | `parseLogfmt()` helper in `tests/helpers/logfmt.ts` | Consistent handling of quoted values with escape sequences |
| Stream capture | Patching `console.error` directly | `captureAll()` via `process.stderr.write` intercept | Captures the raw bytes Node writes, regardless of which console method emitted them |
| Registry cleanup | Manual registry mutation per test | `import '../../../tests/helpers/reset'` | Correct in-place mutation of the captured registry reference |

---

## Critical Behavioral Contracts

### Level → Stream Routing Map

This is the exact dispatch table from `LEVEL_METHODS` in `src/logger/index.ts`:

| Level | Console Method | Stream (json/logfmt) | Stream (pretty) |
|-------|---------------|---------------------|----------------|
| emerg | console.error | **stderr** | stderr + stdout (stack trace) |
| alert | console.error | **stderr** | stderr + stdout (stack trace) |
| crit  | console.error | **stderr** | stderr + stdout (stack trace) |
| error | console.error | **stderr** | stderr + stdout (stack trace) |
| warn  | console.warn  | **stderr** | stderr + stdout (stack trace) |
| notice | console.info | stdout | stdout |
| success | console.info | stdout | stdout |
| info   | console.info | stdout | stdout |
| verb   | console.debug | stdout | stdout |
| debug  | console.debug | stdout | stdout |
| wth    | console.debug | stdout | stdout |

**Key insight:** `emitConsole` returns early after writing the JSON/logfmt line — the `trace` block runs ONLY in pretty mode. TRACE_LEVELS thus produce exactly one stderr line in json/logfmt format.

### JSON Field Contract (from `serializeJSON` + `extractFields`)

JSON fields are always written in this exact order:
1. `time` — ISO 8601 string (`new Date(ts ?? Date.now()).toISOString()`)
2. `level` — console method name (e.g., `"error"` for emerg/alert/crit/error, `"warn"` for warn, `"info"` for notice/success/info, `"debug"` for verb/debug/wth)
3. `severity` — actual log level string (e.g., `"emerg"`, `"warn"`, `"info"`)
4. `scope` — only present for scoped loggers (string, e.g., `"my-scope"`)
5. `caller` — only present when `stack: true` is set (string, e.g., `"file.ts:12:5"`)
6. `progress` — only present for spinner progress updates (Phase 3, not here)
7. `msg` — the message string (always present, may be `""`)
8. `data` — only present when extra arguments are passed

**Critical distinction:** `level` is the *console method* name, `severity` is the *log level* name. For `info` level they happen to be equal; for `emerg`, `level = "error"` and `severity = "emerg"`.

### logfmt Field Contract (from `serializeLogfmt`)

logfmt fields are written in the same order as JSON. Values are JSON-stringified (quoted strings, no quotes for simple strings without spaces). Example:
```
time="2026-03-24T12:00:00.000Z" level=info severity=info msg="hello world"
```

### pretty Field Contract (from `renderConsolePrefix`)

`renderConsolePrefix` produces **only** a plain-text prefix string with brackets:
- No ANSI escape codes — ever (that is `renderTTYPrefix`'s job)
- Level badge: `[LABEL]` (plain text, exact label from `LEVEL_DISPLAY`, padded if `pad=true`)
- Scope: `[LABEL <scope-name>]`
- Date: `[YYYY-MM-DD HH:MM:SS.mmm]`
- Caller: `(file:line:col)` — only when `structuredOnly=false`

The final output captured from `process.stdout.write` is:
`console.info('[INFO]', 'msg')` → Node writes `[INFO] msg\n` to stdout.

### Padding Behavior (`pad: true` is default in Node)

From `src/logger/levels.ts` initialization block:
```
padSize = max label length = len('WHO CARES?') = 10
```
Center-padding formula: `.padEnd(label.length + (padSize - label.length) / 2).padStart(padSize)`

Result examples:
- `INFO` (4) → `'  INFO    '` (or similar — exact spacing depends on the arithmetic)
- `DEBUG` (5) → `'  DEBUG   '`
- `EMERGENCY` (9) → `' EMERGENCY'`
- `WHO CARES?` (10) → `'WHO CARES?'`

**Set `L.pad = false` before every pretty-format test** to avoid fragile snapshot values that embed padding that may shift if labels change.

### computeOptions Level Cascade (OPT-02, OPT-03)

```
allLayers = [ownOptions, registry.rootOptions, DEFAULT_LOGGER_OPTIONS]
levelCandidates = all defined .level values from those layers
effectiveLevel = min by LEVEL_SEVERITY value (strictest = most critical = lowest number)
```

Filtering gate in `prepareLog`:
```
if (LEVEL_SEVERITY[effectiveLevel] < LEVEL_SEVERITY[logLevel]) → suppress
```
("If configured threshold is stricter than the message being logged → drop it.")

| Root level | Scope level | Effective for scope | Suppressed |
|-----------|-------------|--------------------|---------------------------------|
| `'warn'` (4) | not set | `'warn'` (4) | notice(5), success(6), info(7), verb(8), debug(9), wth(10) |
| `'warn'` (4) | `'error'` (3) | `'error'` (3) | warn(4), notice(5), … wth(10) |
| `'error'` (3) | `'warn'` (4) | **`'error'` (3)** | root dominates — warn through wth suppressed |

### Mixin Counter Lifecycle

- `entries` Map lives in the closure returned by `createLimitMixin(dispatch)`.
- This closure is created once per call to `createScopeLogger()`.
- `reset.ts` deletes `registry.scopes[name]` → the old scope object (including its closure) becomes unreachable → GC'd.
- `L.scope('name')` on the next test call to `createScopeLogger` → new closure → fresh `entries` Map → counters start at 0.
- **Consequence:** any unique `scope('name')` per test automatically gets fresh counters after reset. No manual counter clearing needed.

### `once()` key derivation

```
getLimitCallerKey() → new Error().stack.split('\n')[3].trim()
```

Frame 0: `getLimitCallerKey` itself; frame 1: `once()`/`limit()`; frame 2: the LimitedLogger level method; frame 3: **user call-site**. 

Same file + same line → same key. Two different lines in the same test → two different counters. This means: all three calls to `L.once().info('x')` in a loop at the same source line → share one counter (limit 1 → first call passes, rest suppressed).

### `bypass()` Test Strategy

`bypass()` sets `activeConsole = <passed object>`. All `method.apply(activeConsole, ...)` calls route through it. The passed object does NOT need to be a full `Console` — only the methods the test exercises need to be implemented.

```typescript
// Minimal spy console for bypass tests
const calls: Array<{ method: string; args: unknown[] }> = [];
const spy = {
  info: (...args: unknown[]) => calls.push({ method: 'info', args }),
  error: (...args: unknown[]) => calls.push({ method: 'error', args }),
  warn: (...args: unknown[]) => calls.push({ method: 'warn', args }),
  debug: (...args: unknown[]) => calls.push({ method: 'debug', args }),
  log: (...args: unknown[]) => calls.push({ method: 'log', args }),
  groupCollapsed: () => {},
  groupEnd: () => {},
  group: () => {},
} as unknown as Console;
```

**Critical:** `restore()` MUST be called in every bypass test — `reset.ts` does not reset `activeConsole`.

### `patch()` Test Strategy

After `L.patch()`:
- `console.log` and `console.info` → `L.info.bind(L)` → stdout (info level)
- `console.debug` → `L.debug.bind(L)` → stdout (debug level)
- `console.warn` → `L.warn.bind(L)` → stderr (warn level, json/logfmt)
- `console.error` → `L.crit.bind(L)` → stderr (crit level, json/logfmt)

Test via `captureAll()`:
```typescript
afterEach(() => L.unpatch()); // restore native methods

test('patch() routes console.info through the logger', () => {
  L.patch();
  const { stdout } = captureAll(() => console.info('patched'));
  const parsed = JSON.parse(stdout[0]);
  expect(parsed.msg).toBe('patched');
  expect(parsed.severity).toBe('info');
});
```

---

## Common Pitfalls

### Pitfall 1: Pretty format + TRACE_LEVELS → stdout + stderr split

**What goes wrong:** Test asserts `stdout[0]` contains the log line for `L.error('x')` in pretty format. The log line is in `stderr[0]` and `stdout[0]` contains the stack trace string instead.

**Why it happens:** In pretty mode, `emitConsole` does NOT return early — it calls `method.apply(...)` (stderr) then `activeConsole.log(stack)` (stdout).

**How to avoid:** For pretty format tests, either:
1. Use non-TRACE levels (info, debug) — they produce only stdout output with no stack trace.
2. If testing a TRACE level in pretty mode: use `captureAll()`, expect `stderr[0]` for the log line, `stdout[0]` for the stack trace.

**Warning signs:** `stdout[0]` looks like a Node.js stack trace (starts with `Error` or `at `).

### Pitfall 2: json/logfmt — TRACE_LEVELS are safe

**What goes wrong:** Developer avoids testing error/warn in json/logfmt because they expect stack trace noise.

**Why it's not actually a problem:** `emitConsole` **returns early** after writing the JSON/logfmt line:
```ts
if (isNode && (format === 'json' || format === 'logfmt')) {
  method.apply(activeConsole, [line]);
  return; // ← no trace logic follows
}
```

**Correction:** json/logfmt format tests can freely assert on error/warn levels — they produce exactly one stderr line with no stdout output.

### Pitfall 3: `reset.ts` does NOT restore `activeConsole` or `console` methods

**What goes wrong:** A `bypass()` or `patch()` test fails to call `restore()` / `unpatch()`, leaving global console state mutated for subsequent tests.

**Why it happens:** `reset.ts` only clears `registry.scopes`, `registry.exclusive`, `registry.format`, and `registry.rootOptions`. It does not touch `activeConsole` or the native `console` object.

**How to avoid:** Every test that calls `L.bypass(...)` must call `L.restore()` in `afterEach`. Every test that calls `L.patch()` must call `L.unpatch()` in `afterEach` or `try/finally`.

### Pitfall 4: `level` ≠ `severity` in JSON/logfmt for TRACE_LEVELS

**What goes wrong:** Test asserts `parsed.level === 'emerg'`. The actual value is `"error"` (the console method name). The test fails.

**Why it happens:** The JSON `level` field is `LevelPrefix.channel` = `LEVEL_METHODS[logLevel].name` = the native function name (`"error"`, `"warn"`, `"info"`, `"debug"`). The `severity` field carries the actual log level string.

**How to avoid:** For levels where the console method name differs from the level name:
- `emerg`, `alert`, `crit`, `error` → `level = "error"`, `severity = "emerg"|"alert"|"crit"|"error"`
- `warn` → `level = "warn"`, `severity = "warn"` (same)
- `notice`, `success`, `info` → `level = "info"`, `severity = "notice"|"success"|"info"`
- `verb`, `debug`, `wth` → `level = "debug"`, `severity = "verb"|"debug"|"wth"`

### Pitfall 5: pad=true (default) makes pretty snapshots unstable

**What goes wrong:** Pretty format snapshot includes padding: `'[  INFO    ] msg'`. Label layout breaks if label lengths change.

**How to avoid:** Set `L.pad = false` before every pretty-format assertion.

### Pitfall 6: Using root `L` for mixin/limit tests

**What goes wrong:** Two `once()` tests in the same file both call `L.once().info('x')` at different source lines. Both pass in isolation. When run together, the second test fails — the entries map on root L accumulates across tests because `reset.ts` doesn't recreate the root logger (only clears registry state).

**How to avoid:** Always use `L.scope('unique-name-per-test').once()` for ALL mixin tests. `reset.ts` deletes scopes, so each test gets a fresh scope with a fresh entries map.

### Pitfall 7: Caller key is based on source line, not test run

**What goes wrong:** MIX-03 test uses `L.scope(s).limit(3).info('x')` called from three different source lines (different files, or different lines in the loop body), expecting one shared counter. All three fire because each line generates a distinct key.

**How to avoid:** D-10 mandates an explicit `key` string for MIX-03: `L.scope(s).limit(3, 'my-fixed-key').info('x')`. The explicit key overrides `getLimitCallerKey()` entirely.

### Pitfall 8: CONS tests leave state if test throws

**What goes wrong:** `L.patch()` is called, test throws an error, `unpatch()` is never called, subsequent tests run against a patched console.

**How to avoid:** Use `afterEach(() => { L.unpatch(); L.restore(); })` unconditionally for the entire `console.test.ts` file. This is idempotent — calling unpatch/restore when not patched/bypassed is a no-op.

---

## Code Examples

### Verified level dispatch map (from `src/logger/index.ts`)

```typescript
// Source: src/logger/index.ts LEVEL_METHODS constant
const LEVEL_METHODS = {
  emerg: console.error,   // → stderr
  alert: console.error,   // → stderr
  crit:  console.error,   // → stderr
  error: console.error,   // → stderr
  warn:  console.warn,    // → stderr
  notice: console.info,   // → stdout
  success: console.info,  // → stdout
  info:    console.info,  // → stdout
  verb:    console.debug, // → stdout
  debug:   console.debug, // → stdout
  wth:     console.debug, // → stdout
};
```

### Verified JSON field order (from `src/logger/prefix/serialize.ts`)

```typescript
// Source: src/logger/prefix/serialize.ts serializeJSON
const obj: Record<string, unknown> = {};
obj.time     = time;      // always
obj.level    = level;     // always — console method name
obj.severity = severity;  // always — log level name
if (scope !== undefined)    obj.scope    = scope;
if (caller !== undefined)   obj.caller   = caller;
if (progress !== undefined) obj.progress = progress;
obj.msg = msg;            // always
if (data !== undefined) obj.data = data;
```

### Verified logfmt field order (from `src/logger/prefix/serialize.ts`)

```typescript
// Source: src/logger/prefix/serialize.ts serializeLogfmt
parts.push(`time=${JSON.stringify(time)}`);
parts.push(`level=${level}`);
parts.push(`severity=${severity}`);
if (scope !== undefined)    parts.push(`scope=${scope}`);
if (caller !== undefined)   parts.push(`caller=${JSON.stringify(caller)}`);
if (progress !== undefined) parts.push(`progress=${JSON.stringify(progress)}`);
parts.push(`msg=${JSON.stringify(msg)}`);
if (data !== undefined) parts.push(`data=...`);
```

### Verified pretty prefix (from `src/logger/prefix/render.ts`)

```typescript
// Source: src/logger/prefix/render.ts renderConsolePrefix
// level item → '[LABEL]' (plain text, no ANSI, scope appended as ' <scope>')
// text item  → '[text]' if badge, else 'text'
// date item  → '[YYYY-MM-DD HH:MM:SS.mmm]'
// caller     → '(file:line:col)' unless structuredOnly
// result: items joined by ' '
```

### Verified `createCoreLogger` option setters

```typescript
// Source: src/logger/index.ts createCoreLogger
get enabled() { return computeOptions(state.options).enabled; }
set enabled(b: boolean) { state.options.enabled = b; }
// — same pattern for: level, pad, color, date, stack, uid, inspect
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | @rstest/core 0.9.4 |
| Config file | `rstest.config.ts` |
| Quick run command | `pnpm test:node` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | File | Automated Command |
|--------|----------|-----------|------|--------------------|
| CORE-01 | 11 levels dispatch to correct stream | integration | levels.test.ts | `pnpm test:node` |
| CORE-02 | Level filter suppresses lower levels | unit | levels.test.ts | `pnpm test:node` |
| CORE-03 | enabled=false suppresses all output | unit | levels.test.ts | `pnpm test:node` |
| CORE-04 | JSON output: parse + field assertions | unit | formats.test.ts | `pnpm test:node` |
| CORE-05 | logfmt output: parse + field assertions | unit | formats.test.ts | `pnpm test:node` |
| CORE-06 | pretty output: badge text + no ANSI | unit | formats.test.ts | `pnpm test:node` |
| PREFIX-01 | Level badge label per level in all formats | unit | prefix.test.ts | `pnpm test:node` |
| PREFIX-02 | date=true injects ISO 8601 timestamp | unit | prefix.test.ts | `pnpm test:node` |
| PREFIX-03 | stack=true injects caller in json/logfmt | unit | prefix.test.ts | `pnpm test:node` |
| PREFIX-04 | Scope name in badge for scoped logger | unit | prefix.test.ts | `pnpm test:node` |
| OPT-01 | All getters/setters read/write | unit | options.test.ts | `pnpm test:node` |
| OPT-02 | Cascade: own > root > default | unit | options.test.ts | `pnpm test:node` |
| OPT-03 | Level cascade picks strictest | unit | options.test.ts | `pnpm test:node` |
| OPT-04 | util.inspect forwarded correctly | unit | options.test.ts | `pnpm test:node` |
| SCOPE-01 | scope() returns ScopeLogger with .scope | unit | scopes.test.ts | `pnpm test:node` |
| SCOPE-02 | Same name returns cached instance | unit | scopes.test.ts | `pnpm test:node` |
| SCOPE-03 | Scope inherits root, overrides independently | unit | scopes.test.ts | `pnpm test:node` |
| SCOPE-04 | Scope mutations don't leak | unit | scopes.test.ts | `pnpm test:node` |
| MIX-01 | once() emits once per call-site | unit | mixins.test.ts | `pnpm test:node` |
| MIX-02 | limit(n) emits n times | unit | mixins.test.ts | `pnpm test:node` |
| MIX-03 | limit(n, key) groups by explicit key | unit | mixins.test.ts | `pnpm test:node` |
| MIX-04 | options({...}).level() one-shot | unit | mixins.test.ts | `pnpm test:node` |
| REG-01 | L is same instance across imports | unit | registry.test.ts | `pnpm test:node` |
| REG-02 | globalThis registry persists | unit | registry.test.ts | `pnpm test:node` |
| REG-03 | exclusive=true silences others | unit | registry.test.ts | `pnpm test:node` |
| REG-04 | format getter/setter on registry | unit | registry.test.ts | `pnpm test:node` |
| CONS-01 | patch() replaces console methods | integration | console.test.ts | `pnpm test:node` |
| CONS-02 | unpatch() restores original methods | integration | console.test.ts | `pnpm test:node` |
| CONS-03 | bypass(console) redirects to custom | unit | console.test.ts | `pnpm test:node` |
| CONS-04 | restore() reverts to system console | unit | console.test.ts | `pnpm test:node` |

### Sampling Rate

- **Per task commit:** `pnpm test:node` (node project only, fast)
- **Per wave merge:** `pnpm test:node`
- **Phase gate:** `pnpm test:node` fully green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/helpers/capture.ts` — `captureAll()` helper (new file, needed by most test files)
- [ ] `tests/helpers/logfmt.ts` — `parseLogfmt()` helper (new file, needed by formats.test.ts, prefix.test.ts)
- [ ] 8 new test files in `tests/node/main/` (all new, all need to be created)

---

## Environment Availability

Step 2.6: SKIPPED — Phase 2 is pure test authoring. No external tools, services, databases, or CLI utilities beyond the existing Node.js / pnpm / rstest stack (all verified operational from Phase 1).

---

## Sources

### Primary (HIGH confidence — verified from source code)

- `src/logger/index.ts` — LEVEL_METHODS dispatch table, emitConsole early-return for json/logfmt, createRootMixin (bypass/restore/patch/unpatch/scope), createCoreLogger (option getters/setters), createLogger (format defineProperty), createLimitMixin, createScopeLogger
- `src/logger/prefix/serialize.ts` — serializeJSON and serializeLogfmt exact field names and ordering
- `src/logger/prefix/render.ts` — renderConsolePrefix plain-text output contract
- `src/logger/prefix/types.ts` — LevelPrefix.channel vs LevelPrefix.severity distinction confirmed
- `src/logger/prefix/index.ts` — getPrefix: channel = LEVEL_METHODS[level].name, severity = level
- `src/logger/mixins/limit.ts` — getLimitCallerKey frame index, createLimitMixin entries Map lifecycle
- `src/logger/mixins/override.ts` — createOneShot one-shot dispatch, no mutation
- `src/logger/levels.ts` — LEVEL_DISPLAY labels, paddedLabel computation formula, LEVEL_METHODS severity numbers
- `src/levels.ts` — TRACE_LEVELS Set members confirmed: emerg, alert, crit, error, warn
- `src/logger/const.ts` — DEFAULT_LOGGER_OPTIONS: pad=isNode (true in tests), level='wth' (most permissive)
- `tests/helpers/stdout.ts` — captureStdout pattern (Uint8Array → TextDecoder, try/finally restore)
- `tests/helpers/reset.ts` — exact fields reset: scopes, exclusive, format, rootOptions
- `rstest.config.ts` — disableConsoleIntercept: true, setupFiles, include patterns
- `package.json` — test:node and test commands confirmed

### Secondary (MEDIUM confidence)

None — all critical findings are HIGH confidence from direct source code reading.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Phase 1 installed and configured everything; no new packages needed
- Architecture (test file layout): HIGH — locked decisions in CONTEXT.md, no discretion required
- Behavioral contracts (dispatch, formats, options): HIGH — verified line-by-line from source
- Pitfalls: HIGH — derived directly from the runtime logic in index.ts, not inferred

**Research date:** 2026-03-24
**Valid until:** Stable until source files are modified — these findings are guaranteed current as of this date

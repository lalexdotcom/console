# Phase 08: TestAdapter + Shared Suites + Node-Console Adapter — Research

**Researched:** 2026-03-25
**Domain:** rstest parameterised test suites, TestAdapter pattern, Node process.stdout capture, browser console spy
**Confidence:** HIGH (all findings from direct source-code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — `tests/common/adapter.ts` exports exactly:
  ```ts
  export interface TestAdapter {
    name: string;
    setup(): void | Promise<void>;
    capture(fn: () => void | Promise<void>): Promise<string[]>;
    readonly logger: RootLogger;
  }
  ```
  `capture()` returns normalised string lines (newlines split, empty lines stripped).

- **D-02** — 7 suite files in `tests/common/`, each exporting `makeSuite(adapter: TestAdapter)`:
  `levels.suite.ts`, `formats.suite.ts`, `scopes.suite.ts`, `options.suite.ts`,
  `prefix.suite.ts`, `mixins.suite.ts`, `spinners.suite.ts`

- **D-03** — Suite content = **full port** of existing `tests/node/main/*.test.ts` into parameterised form. Every `describe()` / `it()` block becomes a test case inside `makeSuite()`.

- **D-04** — `spinners.suite.ts` covers **non-TTY spinner behavior only** (console/browser renderer). TTY spinner tests stay in `tests/tty/main/spinner-tty.test.ts` — untouched.

- **D-05** — Snapshot strategy: reuse the `line.replace(/"time":"[^"]*"/, '"time":"<ts>"')` pattern from `formats.test.ts`. Non-deterministic fields stripped before `toMatchInlineSnapshot()`. Deterministic fields use `toMatchInlineSnapshot()`; flexible checks use `toContain()`.

- **D-06** — `node-console` adapter wraps `captureAll()` from `tests/common/capture.helper.ts`. Three format variants (json, logfmt, pretty) — each sets `L.format` in `setup()`. File: `tests/node/main/battery-node-console.test.ts`.

- **D-07** — `browser-main` adapter wraps existing Playwright infrastructure from `tests/browser/main/browser.test.ts`. File: `tests/browser/main/battery-browser.test.ts`.

- **D-08** — Test files placed in their environment directories:
  - `tests/node/main/battery-node-console.test.ts`
  - `tests/browser/main/battery-browser.test.ts`
  No `rstest.config.ts` changes in Phase 08.

### Agent's Discretion

None declared in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

- BATTERY-04, BATTERY-06 — worker adapters, tty env override → Phase 09
- BATTERY-05, BATTERY-07, VERSION-02 — rstest split, parity suite, version bump → Phase 10
- TTY adapter — Phase 09
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BATTERY-01 | `TestAdapter` interface defined in `tests/common/adapter.ts` | §TestAdapter Interface + §Type System |
| BATTERY-02 | Shared suites in `tests/common/*.suite.ts`, each `makeSuite(adapter: TestAdapter)` | §Suite Content Mapping |
| BATTERY-03 | Adapters for: node-console (json/logfmt/pretty) + browser-main | §Node-Console Adapter + §Browser Adapter |
</phase_requirements>

---

## Summary

Phase 08 is a port-and-wire exercise. All source test content already exists in `tests/node/main/*.test.ts` — the job is to lift each `describe` block into a `makeSuite(adapter)` factory and wire up two concrete adapters that run those factories.

The **node-console adapter** has no structural surprises: `captureAll()` from `capture.helper.ts` is async-safe if wrapped with `await fn()` while stdout/stderr are patched (required for `exec()` async tests in the spinners suite). Three format variants set `L.format` in `setup()` after the global `reset.helper.ts` `beforeEach` fires.

The **browser adapter** is the harder problem. The existing `browser.test.ts` proves that rstest browser mode runs tests inside the Playwright page context and uses `rs.spyOn(console, 'method')` — there is no `page` object accessible from test code. Browser output format is `%c CSS` strings, not JSON/logfmt/pretty — so the `capture()` implementation must normalize `%c` calls into string lines, and the `formats.suite.ts` format-parsing tests **cannot run as-is** in browser context. This is the primary risk area (see §Risk Areas).

**Primary recommendation:** Implement the node-console adapter first and verify all 7 suites pass. Then build the browser adapter, deciding which suites run in browser context (likely 5 of 7 — omitting formats and the stdout/stderr-routing portions of levels).

---

## Standard Stack

### Core (already installed, no new dependencies)

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `@rstest/core` | 0.9.x | `describe`, `test`, `expect`, `beforeEach`, `rs.spyOn`, `rs.useFakeTimers` | Used by all suites |
| `@rstest/adapter-rslib` | as locked | rstest ↔ rslib bridge | Already in `rstest.config.ts` |

No new npm packages required in this phase.

---

## Architecture Patterns

### Project Structure After Phase 08

```
tests/
├── common/
│   ├── adapter.ts            ← NEW: TestAdapter interface
│   ├── capture.helper.ts     ← KEEP as-is
│   ├── reset.helper.ts       ← KEEP as-is
│   ├── logfmt.helper.ts      ← NEW (move/copy parseLogfmt from tests/node/main/)
│   ├── levels.suite.ts       ← NEW
│   ├── formats.suite.ts      ← NEW
│   ├── scopes.suite.ts       ← NEW
│   ├── options.suite.ts      ← NEW
│   ├── prefix.suite.ts       ← NEW
│   ├── mixins.suite.ts       ← NEW
│   └── spinners.suite.ts     ← NEW
├── node/main/
│   ├── battery-node-console.test.ts  ← NEW
│   ├── (all existing *.test.ts unchanged)
│   └── logfmt.helper.ts      ← KEEP (or delete after move to common/)
└── browser/main/
    ├── battery-browser.test.ts       ← NEW
    └── browser.test.ts       ← KEEP as-is
```

---

## Suite Content Mapping

All 7 suite files port the following existing test content verbatim (parameterised):

### 1. `levels.suite.ts` ← `tests/node/main/levels.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `Level dispatch (CORE-01)` | `test.each` 11 levels | Routes to stdout/stderr |
| `Level filtering (CORE-02)` | 4 tests | Threshold suppression (below, at, above, default) |
| `Logger.enabled toggle (CORE-03)` | 3 tests | `enabled=false` suppresses all; scope also suppressed |

**Total: 18 tests**

⚠️ **Browser incompatibility:** The CORE-01 tests check `stdout`/`stderr` routing via `captureAll`. In browser context there is no stdout/stderr — the `adapter.capture()` returns all lines as a flat array. The suite must avoid `toHaveLength(0)` on individual stdout/stderr arrays and instead check `lines.some(l => ...)` or skip routing assertions via `adapter.name` check.

### 2. `formats.suite.ts` ← `tests/node/main/formats.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `JSON format (CORE-04)` | 6 tests | Parseable JSON, field names, field order, scope field, inline snapshot with `<ts>` |
| `logfmt format (CORE-05)` | 3 tests | key=value pairs, field order, emerg on stderr |
| `pretty format (CORE-06)` | 5 tests | `[LABEL]` badges, no ANSI codes, inline snapshot |

**Total: 14 tests**

⚠️ **Browser incompatibility:** Browser output is CSS `%c` format strings, not JSON/logfmt/pretty. `JSON.parse(lines[0])` and `parseLogfmt(lines[0])` will throw. This suite should **not run** with the browser adapter, or each describe block should be guarded with `adapter.name`-based skip.

⚠️ **`parseLogfmt` import:** The helper lives at `tests/node/main/logfmt.helper.ts`. The formats suite lives in `tests/common/`. The helper must be **moved (or copied) to `tests/common/logfmt.helper.ts`** before the suite can import it via a stable relative path.

### 3. `scopes.suite.ts` ← `tests/node/main/scopes.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `Scope creation (SCOPE-01)` | 2 tests | `s.scope` property, all 11 level methods, `once`/`limit`/`options` present |
| `Scope caching (SCOPE-02)` | 2 tests | Same name → same reference; different names → distinct |
| `Scope options cascade (SCOPE-03)` | 3 tests | Root `date` cascades to scope; scope override hides root; scope date doesn't leak to root |
| `Scope mutation isolation (SCOPE-04)` | 2 tests | Sibling scope level change doesn't affect other; scope level doesn't affect root |

**Total: 9 tests**

Note: `SCOPE-03` inherits/override tests use `pretty` format with `pad=false` to check the date-bracket pattern. The suite tests that set `L.format = 'pretty'` internally are self-contained regardless of adapter format variant.

### 4. `options.suite.ts` ← `tests/node/main/options.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `Option getters/setters (OPT-01)` | 8 tests | All 8 options: enabled, level, pad, color, date, stack, uid, inspect — round-trip |
| `Option cascade: own > root > defaults (OPT-02)` | 4 tests | Root cascades; scope overrides; no leak; default applies |
| `Level cascade: strictest wins (OPT-03)` | 3 tests | OPT-03: numeric severity comparisons |
| `util.inspect forwarding (OPT-04)` | 2 tests | depth=0 limits output; depth=5 shows nested fields |

**Total: 17 tests**

Note: `OPT-01` checks `L.pad` with `expect(L.pad).toBe(true)` (default is `true` in Node). In the browser context, `isNode=false`, so the default `pad` may differ — another browser incompatibility to guard.

### 5. `prefix.suite.ts` ← `tests/node/main/prefix.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `Level badge (PREFIX-01)` | `test.each` 11 levels | `[LABEL]` bracket in pretty; no ANSI codes |
| `Date prefix (PREFIX-02)` | 3 tests | ISO 8601 bracket when `date=true`; absent when `false`; logfmt `time=` field |
| `Caller prefix (PREFIX-03)` | 3 tests | JSON `caller` field with `stack=true`; absent without; TRACE_LEVELS always include |
| `Scope prefix (PREFIX-04)` | 3 tests | `[INFO <my-scope>]` in pretty; `scope` in JSON; root has no scope |

**Total: 20 tests**

### 6. `mixins.suite.ts` ← `tests/node/main/mixins.test.ts`

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `once() (MIX-01)` | 1 test | Loop × 5 → exactly 1 emission |
| `limit(n) (MIX-02)` | 1 test | Loop × 10, limit=3 → exactly 3 emissions |
| `limit(n, key) (MIX-03)` | 1 test | 3 separate `captureAll` calls share one counter — 2 emit, 1 dropped |
| `options({...}) (MIX-04)` | 1 test | One-shot `date=true` override; next call reverts |

**Total: 4 tests**

⚠️ **MIX-03 pattern:** Uses three **separate** `captureAll()` calls (one per assertion) so that the per-call-site key counter accumulates across them. The suite's `adapter.capture()` must support this pattern — three awaits, each returning an independent capture. This already works since each `capture()` call independently patches/unpatches stdout.

⚠️ **Scope uniqueness:** Every mixin test uses `L.scope('unique-name')` to guarantee limiter isolation. The suite must preserve these unique scope names across describe blocks (no collisions). Since `reset.helper.ts` clears `registry.scopes` before each test, this is safe as long as names are unique within one test.

### 7. `spinners.suite.ts` ← `tests/node/main/spinner-node.test.ts` (non-TTY only)

| `describe` block | Tests | Key behaviour |
|-----------------|-------|---------------|
| `spinner lifecycle (SPIN-01)` | 6 tests | start → `⋯`; tick advance; update text; success `✔`; fail `✖`; stop → no output |
| `stopped terminal state (SPIN-02)` | 2 tests | success/fail after stop → 0 lines; double success idempotent |
| `autoStart option (SPIN-03)` | 3 tests | autoStart:true (default) emits immediately; false emits nothing; false+start() emits |
| `exec() (SPIN-04)` | 2 tests | Fulfilled → `✔`; rejected → `✖` and re-throws |
| `duration: true (SPIN-05)` | 1 test | Success message contains `+Nms` suffix |
| `progress option (SPIN-06)` | 2 tests | ratio 0.5 → progress bar with `%` or `●`; {done,total} → fraction |
| `console renderer bracket badges (SPIN-08)` | 4 tests | `[ ⋯ ]`, `[ ✔ ]`, `[ ✖ ]` bracket format; no cursor control; error-level → stderr |

**Total: 20 tests**

⚠️ **`interceptStdout` usage:** The existing spinner tests use a local `interceptStdout` helper (inside spinner-node.test.ts) for timer-advancing tests. This function is identical to `captureAll` but stdout-only. In the suite, use `adapter.capture(fn)` directly — `fn` calls `rs.useFakeTimers()` and `rs.advanceTimersByTime()` inside itself before returning, so the sync nature of fake timers means everything is captured within the single `captureAll` intercept window. This pattern works correctly.

⚠️ **`exec()` tests (async):** The existing exec tests manually patch `process.stdout.write` before `await`, ensuring async output is captured. The node-console adapter's `capture(fn)` must use `await fn()` while stdout/stderr are patched (NOT wrap `captureAll()` synchronously around fn). See §Node-Console Adapter section.

⚠️ **`rs.useFakeTimers()` in suites:** `rs.useFakeTimers()` is idiomatic per-test. The suite calls it inside individual test bodies — this is fine and identical to the existing pattern. No `afterEach` cleanup for fake timers is needed (rstest auto-restores).

---

## TestAdapter Interface

### Type Import

```ts
// tests/common/adapter.ts
import type { RootLogger } from '../../src/types';

export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  readonly logger: RootLogger;
}
```

`RootLogger` is exported directly from `src/types.ts` (line 125) and re-exported through `src/logger/types.ts` and `src/logger/index.ts`. Importing from `../../src/types` is the cleanest path from `tests/common/adapter.ts`.

---

## Node-Console Adapter Implementation Constraints

### Format Variants

Three adapter objects are constructed in `battery-node-console.test.ts`:

```ts
const jsonAdapter: TestAdapter = {
  name: 'node-console/json',
  setup() { L.format = 'json'; },
  async capture(fn) { /* see below */ },
  get logger() { return L; },
};
// Same structure for 'logfmt' and 'pretty'
```

### `capture(fn)` — Async-Safe Implementation

The existing `captureAll(fn)` is **synchronous** (does not await fn). For the SPIN-04 `exec()` tests (which await an async operation while output is captured), the adapter needs an async-capable version:

```ts
async capture(fn: () => void | Promise<void>): Promise<string[]> {
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
    await fn();  // KEY: await here so async fn(exec) completes while patches active
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return [...out, ...err]
    .flatMap(chunk => chunk.split('\n'))
    .filter(line => line.trim() !== '');
}
```

This is an extended version of `captureAll` — **do not just call `captureAll(fn)` synchronously**; that would miss output from async operations like `exec()`.

### `setup()` Execution Order

The global `reset.helper.ts` `beforeEach` runs first (via `setupFiles`), resetting format to `'json'`. The suite's own `beforeEach` (registered inside `makeSuite`) runs second and calls `adapter.setup()`. Result: format is correctly set per-variant each test.

```
rstest beforeEach order:
  1. reset.helper.ts → reg.format = 'json', clears scopes, etc.
  2. makeSuite's beforeEach → adapter.setup() → L.format = 'json'|'logfmt'|'pretty'
```

### Battery File Structure

`tests/node/main/battery-node-console.test.ts` installs all 7 suites × 3 variants:

```ts
import { makeSuite as makeLevelsSuite } from '../../common/levels.suite';
// ... other suites

const adapters = [jsonAdapter, logfmtAdapter, prettyAdapter];

for (const adapter of adapters) {
  makeLevelsSuite(adapter);
  makeFormatsSuite(adapter);
  // ...
}
```

---

## Browser Adapter Implementation Constraints

### Critical Finding: No `page` Object in rstest Browser Mode

D-07 mentions `page.on('console', ...)` — this is **incorrect for rstest browser mode**. When rstest runs browser tests via Playwright, the test code executes **inside the browser context**. There is no Playwright `page` API available. The correct pattern (proven by the existing `browser.test.ts`) is `rs.spyOn(console, 'method')`.

Verified by: `tests/browser/main/browser.test.ts` uses only `rs.spyOn`, never `page`.

### `capture(fn)` in Browser Context

```ts
async capture(fn: () => void | Promise<void>): Promise<string[]> {
  const methods = ['log', 'debug', 'info', 'warn', 'error', 'groupCollapsed'] as const;
  const spies = methods.map(m => rs.spyOn(console, m).mockImplementation(() => {}));
  try {
    await fn();
  } finally {
    spies.forEach(s => s.mockRestore());
  }
  // Normalize %c format strings to plain text lines
  return spies.flatMap(spy =>
    spy.mock.calls.map(args => {
      const first = String(args[0] ?? '');
      return first.replace(/%c/g, '').trim();
    })
  ).filter(line => line !== '');
}
```

The normalised lines will contain e.g. `' [INFO] msg'`. Suites that check `toContain('[INFO]')` will still pass. Suites that call `JSON.parse(lines[0])` will **fail**.

### Suite Compatibility Matrix (Browser Adapter)

| Suite | Browser Compatible? | Issue |
|-------|---------------------|-------|
| `levels.suite.ts` | ⚠️ Partial | CORE-01 stdout/stderr routing checks invalid; CORE-02/03 output-presence checks work |
| `formats.suite.ts` | ❌ No | JSON.parse / parseLogfmt on browser %c output will throw |
| `scopes.suite.ts` | ✅ Yes | Uses `toContain` / JSON.parse on json format — needs json format to be set |
| `options.suite.ts` | ⚠️ Partial | `L.pad` default is `false` in browser (isNode=false) — OPT-01 test will fail if it checks `true` |
| `prefix.suite.ts` | ⚠️ Partial | Pretty-format badge checks may work; JSON.parse checks depend on json mode being active |
| `mixins.suite.ts` | ✅ Yes | Uses `toHaveLength` on the array from capture — browser lines will still be counted |
| `spinners.suite.ts` | ✅ Yes | Checks `toContain('✔')`, `toContain('⋯')` — browser spinner uses `%c ✔` etc |

**Planner must decide:** Does `battery-browser.test.ts` run all 7 suites (requiring suite-level adapter.name guards) or a subset (5 safe ones, skipping formats + affected levels tests)?

Recommended approach: Run all 7 suites but guard incompatible describe blocks inside each suite:

```ts
// Inside formats.suite.ts
if (!adapter.name.startsWith('browser')) {
  describe('JSON format (CORE-04)', () => { ... });
  describe('logfmt format (CORE-05)', () => { ... });
}
describe('pretty format (CORE-06)', () => { ... }); // might still partially work
```

### `logger` Property in Browser Context

The browser test file imports `L` directly from `../../../src` — this works because rstest browser mode compiles the source for the browser environment via `@rstest/adapter-rslib`. The browser build entry is `dist/browser/index.js` (confirmed present). The browser adapter's `logger` property returns this same `L` singleton.

---

## Type System

### Where to Import `RootLogger`

```ts
// From tests/common/adapter.ts:
import type { RootLogger } from '../../src/types';
// OR equivalently:
import type { RootLogger } from '../../src';  // src/index.ts re-exports all of src/logger/index.ts
```

`RootLogger` is defined in `src/types.ts` line 125:
```ts
export interface RootLogger extends Logger {
  format: 'pretty' | 'json' | 'logfmt';
  scope(scopeName: string, options?: Partial<LoggerOptions>): ScopeLogger;
  patch(): void; unpatch(): void;
  bypass(console: Console): void; restore(): void;
  __logFromMainProcess(...): void;
}
```

`Logger` extends `GenericLogger` (all 11 log level methods) + `LoggerOptions` (enabled, level, pad, color, date, stack, uid, inspect) + `once()`, `limit()`, `options()`, `exclusive`.

### `LogLevels` Array

```ts
import { LogLevels } from '../../../src'; // ['emerg','alert','crit','error','warn','notice','success','info','verb','debug','wth']
```

Used in `scopes.suite.ts` (SCOPE-01) to iterate all level methods.

### `LoggerSpinner` Type

```ts
import type { LoggerSpinner } from '../../../src/types';
```

Used in `spinners.suite.ts` to type the `let sp!: LoggerSpinner` pattern.

---

## Snapshot Normalisation

### Timestamp Stripping Pattern (from `formats.test.ts`)

**JSON format:**
```ts
const stableJson = line.replace(/"time":"[^"]*"/, '"time":"<ts>"');
expect(stableJson).toMatchInlineSnapshot(`"{"time":"<ts>","level":"info","severity":"info","msg":"hello"}"`);
```

**logfmt format:**
```ts
const stableLine = line.replace(/time="[^"]*"/, 'time="<ts>"');
expect(stableLine).toMatchInlineSnapshot(`"time="<ts>" level=info severity=info msg="hello world""`);
```

**Caller field (non-deterministic):** For tests that check `parsed.caller` existence (PREFIX-03), parse the JSON and check `typeof parsed.caller === 'string'` — do not snapshot the caller value. Strip caller before snapshots if needed:
```ts
const { caller: _, ...stable } = parsed;
```

### Variables That Can't Be Snapshotted

| Field | Why dynamic | How to assert |
|-------|-------------|---------------|
| `time` | Wall-clock | Replace with `<ts>` placeholder |
| `caller` | File:line changes per refactor | `toMatch(/\w+\.ts:\d+:\d+/)` only |
| Spinner elapsed time (`+Nms`) | Timer-dependent | `toMatch(/\+\d+(ms|s)/)` |

---

## `parseLogfmt` Helper — Location Problem

Currently `parseLogfmt` lives at: `tests/node/main/logfmt.helper.ts`

`formats.suite.ts` lives at: `tests/common/formats.suite.ts`

The suite **cannot** import from `tests/node/main/logfmt.helper.ts` without creating a cross-boundary dependency from `common/` to `node/`. The solution:

**Move `parseLogfmt` to `tests/common/logfmt.helper.ts`** and update the import in `tests/node/main/formats.test.ts`:
```ts
// formats.test.ts: update import
import { parseLogfmt } from '../../common/logfmt.helper';
```

This is a required change — the planner must include it as a Wave 0 task.

---

## Common Pitfalls

### Pitfall 1: `captureAll` is Synchronous — Async Output Missed

**What goes wrong:** If `capture(fn)` wraps `captureAll(fn)` synchronously and `fn` contains an `await`, async writes after the `try/finally` boundary are not captured.

**Why it happens:** `captureAll` uses `try { fn() } finally { restore }`. If fn is a Promise-returning function, the finally fires before the async work completes.

**How to avoid:** The adapter's `capture` must `await fn()` while the patched streams are still active. Implement the async-safe version shown in §Node-Console Adapter.

**Warning signs:** SPIN-04 `exec()` tests return 0 lines despite the spinner completing.

### Pitfall 2: `reset.helper.ts` Not Visible in Suite `beforeEach`

**What goes wrong:** Suites call `beforeEach(() => adapter.setup())`, but if the reset helper hasn't fired yet, stale format/scopes from a previous test bleed through.

**Why it happens:** Wrong ordering assumption about setup file hooks vs describe-level hooks.

**How to avoid:** rstest fires `setupFiles` hooks first, then test-file and describe-level hooks — this ordering is correct. DO NOT re-import reset.helper.ts inside suite files.

### Pitfall 3: Scope Name Collisions Across Suite Instances

**What goes wrong:** When three format-variant adapters each call `makeSuite`, both reset AND re-create scopes with the same name. Because `reset.helper.ts` clears the scopes cache before each test, names are fresh per test. No collision.

**How to avoid:** This is NOT a problem. The scope cache is wiped before each test via the global beforeEach, so the same scope name can be reused across tests.

### Pitfall 4: Browser Adapter Spy Interference with Logger Internal `console`

**What goes wrong:** `rs.spyOn(console, 'log').mockImplementation(() => {})` silences ALL console output. The logger routes through the spy but the mock returns undefined — the render function may behave differently if it checks the return value of `console.log`.

**Why it happens:** The logger calls `console.log(...)` and discards the return value, so mock returning undefined is fine. BUT if `disableConsoleIntercept` is not set for the browser project, rstest may double-intercept.

**How to avoid:** Check that the browser rstest project has `disableConsoleIntercept: true` — currently it does NOT (only `node` project has it). This may need to be added in Phase 10 (not Phase 08 since we can't change rstest.config.ts).

### Pitfall 5: `rs.useFakeTimers()` In Suite Must Run Per-Test, Not Per-Suite

**What goes wrong:** Calling `rs.useFakeTimers()` once in a suite-level `beforeEach` interferes with non-timer tests that don't clean up.

**How to avoid:** Call `rs.useFakeTimers()` only inside the specific test body that needs timers (pattern already established in existing spinner tests). Do NOT wrap suite in a fake-timers `beforeEach`.

### Pitfall 6: formats.suite.ts Running Against Browser Adapter

**What goes wrong:** `JSON.parse(lines[0])` throws because browser capture normalizes `%c [INFO] msg` (not JSON).

**How to avoid:** Guard format-specific describe blocks with `adapter.name.startsWith('browser')` or only instantiate the formats suite with non-browser adapters in `battery-browser.test.ts`.

---

## File Creation Checklist

### Files to CREATE

| File | What it contains |
|------|-----------------|
| `tests/common/adapter.ts` | `TestAdapter` interface (D-01) |
| `tests/common/logfmt.helper.ts` | `parseLogfmt()` moved from `tests/node/main/logfmt.helper.ts` |
| `tests/common/levels.suite.ts` | `makeSuite(adapter)` — 3 describe blocks from `levels.test.ts` |
| `tests/common/formats.suite.ts` | `makeSuite(adapter)` — 3 describe blocks from `formats.test.ts` |
| `tests/common/scopes.suite.ts` | `makeSuite(adapter)` — 4 describe blocks from `scopes.test.ts` |
| `tests/common/options.suite.ts` | `makeSuite(adapter)` — 4 describe blocks from `options.test.ts` |
| `tests/common/prefix.suite.ts` | `makeSuite(adapter)` — 4 describe blocks from `prefix.test.ts` |
| `tests/common/mixins.suite.ts` | `makeSuite(adapter)` — 4 describe blocks from `mixins.test.ts` |
| `tests/common/spinners.suite.ts` | `makeSuite(adapter)` — 7 describe blocks from `spinner-node.test.ts` (SPIN-01..06, 08 only) |
| `tests/node/main/battery-node-console.test.ts` | 3 adapter variants × 7 suites |
| `tests/browser/main/battery-browser.test.ts` | browser adapter × compatible suites |

### Files to MODIFY

| File | Change |
|------|--------|
| `tests/node/main/logfmt.helper.ts` | Update import path (or delete and re-export from common) |
| `tests/node/main/formats.test.ts` | Update `parseLogfmt` import from `../../common/logfmt.helper` |

### Files to KEEP UNCHANGED

- `tests/common/capture.helper.ts` — used by node-console adapter (not imported directly by suites)
- `tests/common/reset.helper.ts` — stays as global setupFile, suites do NOT import it
- `rstest.config.ts` — Phase 08 explicitly does NOT change this (D-08)
- All existing `tests/node/main/*.test.ts` — keep as regression baseline
- `tests/browser/main/browser.test.ts` — keep as regression baseline
- `tests/tty/main/spinner-tty.test.ts` — out of scope for Phase 08

---

## Risk Areas Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `capture(fn)` must be async (exec() tests) | HIGH | Implement async-safe version, do not reuse synchronous `captureAll` |
| `parseLogfmt` location mismatch | HIGH | Move to `tests/common/logfmt.helper.ts` as Wave 0 prerequisite |
| Browser adapter incompatibility with formats suite | HIGH | Guard format-specific describes with `adapter.name` or skip from browser battery |
| D-07 mentions `page.on` (incorrect for rstest browser) | MEDIUM | Use `rs.spyOn` pattern from existing `browser.test.ts`; `page` is not available |
| `L.pad` default differs browser vs node (OPT-01 test) | MEDIUM | In options suite, check `L.pad` without hardcoding `true` — or wrap in adapter.name check |
| CORE-01 stdout/stderr routing in levels suite | MEDIUM | Levels suite should avoid `toHaveLength(0)` on individual stream arrays; check all-lines instead |
| Scope name uniqueness across 3 format variants per test | LOW | Not a problem — reset helper wipes scopes before each test |

---

## Environment Availability

Step 2.6: **SKIPPED** — Phase 08 is purely test file creation and refactoring. No external tools, services, or CLIs are needed beyond the existing rstest/node/pnpm stack.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | @rstest/core 0.9.x |
| Config file | `rstest.config.ts` (unchanged) |
| Quick run command | `pnpm test -- --reporter=dot` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Files Exist? |
|--------|----------|-----------|-------------------|-------------|
| BATTERY-01 | `TestAdapter` interface exported from `tests/common/adapter.ts` | unit (tsc) | `pnpm exec tsc --noEmit` | ❌ Wave 0 |
| BATTERY-02 | All 7 suite files export `makeSuite(adapter)` | unit | `pnpm test` (node project picks up suites via battery test) | ❌ Wave 0 |
| BATTERY-03 | node-console adapter + browser adapter run suites successfully | integration | `pnpm test` | ❌ Wave 0 |

### Wave 0 Gaps (files that must exist before implementation)

- [ ] `tests/common/adapter.ts` — `TestAdapter` interface
- [ ] `tests/common/logfmt.helper.ts` — `parseLogfmt` moved from `tests/node/main/`

---

## Sources

### Primary (HIGH confidence — direct source inspection)

- `tests/node/main/levels.test.ts` — suite content for levels
- `tests/node/main/formats.test.ts` — suite content for formats + snapshot pattern
- `tests/node/main/scopes.test.ts` — suite content for scopes
- `tests/node/main/options.test.ts` — suite content for options
- `tests/node/main/prefix.test.ts` — suite content for prefix
- `tests/node/main/mixins.test.ts` — suite content for mixins
- `tests/node/main/spinner-node.test.ts` — suite content for spinners
- `tests/browser/main/browser.test.ts` — proves browser mode uses `rs.spyOn`, no `page` object
- `tests/common/capture.helper.ts` — `captureAll()` is sync, node-console adapter must extend it async
- `tests/common/reset.helper.ts` — `beforeEach` hook resets `format='json'`, `scopes={}`, `rootOptions={}`
- `rstest.config.ts` — 2 projects (node + browser), setupFiles=['reset.helper.ts'], `disableConsoleIntercept` only on node
- `src/types.ts` — `RootLogger` at line 125, all logger types
- `.planning/phases/08-shared-test-battery/08-CONTEXT.md` — all locked decisions D-01..D-08
- `.planning/phases/08-shared-test-battery/PHASE.md` — full scope, success criteria, key technical notes

---

## RESEARCH COMPLETE

**Phase:** 08 — TestAdapter + Shared Suites + Node-Console Adapter
**Confidence:** HIGH

### Key Findings

1. **7 suites are a straight port of existing node tests** — all describe/test blocks are already written; the work is wrapping them inside `makeSuite(adapter)` and replacing direct `captureAll()` calls with `await adapter.capture()`.

2. **`captureAll` is synchronous — the adapter must extend it** — the `capture(fn)` implementation must `await fn()` while streams are patched to support async `exec()` tests. Do not call synchronous `captureAll` directly from the adapter.

3. **`parseLogfmt` must move to `tests/common/`** — the formats suite imports it but the helper currently lives in `tests/node/main/`. This is a Wave 0 prerequisite.

4. **Browser adapter uses `rs.spyOn`, not `page.on`** — D-07's description of `page.on('console', ...)` is incorrect for rstest browser mode. The browser test code runs inside Playwright's browser context; `page` is unavailable.

5. **formats.suite.ts is incompatible with the browser adapter** — browser output is CSS `%c` format strings, not parseable JSON/logfmt. The suite must guard format-specific describe blocks with `adapter.name` checks, or `battery-browser.test.ts` must skip the formats suite.

6. **`L.pad` default differs by environment** — OPT-01 asserts `L.pad === true` (Node default). In browser context `isNode=false` and `pad=false`. The options suite needs an adapter-name guard for this assertion.

### Files Created
`.planning/phases/08-shared-test-battery/08-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Suite content mapping | HIGH | Direct source read of all 7 source test files |
| TestAdapter interface | HIGH | Exact spec in CONTEXT.md D-01 |
| node-console adapter constraints | HIGH | Verified `captureAll` implementation + async edge cases |
| Browser adapter constraints | HIGH | Verified `browser.test.ts` uses `rs.spyOn` only, no `page` |
| Type imports | HIGH | `RootLogger` located in `src/types.ts` line 125 |
| Snapshot normalisation | HIGH | Exact regex from `formats.test.ts` |

### Open Questions

1. **Browser suite subset vs guarded full set:** Does `battery-browser.test.ts` skip `formats.suite.ts` entirely, or does `formats.suite.ts` contain `adapter.name` guards internally? The planner should pick one and be consistent.

2. **`battery-node-console.test.ts` structure:** Does it call `makeSuite(adapter)` × 21 (7 suites × 3 formats) in a flat loop, or does it wrap each suite group in an outer `describe('format: json', ...)`? A wrapping describe is recommended for readable test output.

3. **`logfmt.helper.ts` migration:** Should `tests/node/main/logfmt.helper.ts` be deleted after copying to `tests/common/`, or kept as a re-export? Delete-and-update-import is cleaner.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.

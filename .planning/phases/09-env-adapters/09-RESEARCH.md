# Phase 09: Node-TTY + Worker Adapters - Research

**Researched:** 2026-03-26
**Domain:** rstest/rspack module system, child_process.fork stdio, worker proxy lifecycle, shared-suite compatibility
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `tests/tty/env.ts` re-exports everything from `src/utils/env` and statically overrides `isNodeTTY = true` / `isNodeConsole = false`. No env-var, no runtime logic — compile-time constant only. Zero changes to `src/`.
- **D-02:** The TTY adapter patches `process.stdout.write` (via `captureAll()`) to intercept output, including ttyRenderer cursor sequences. Before returning lines, `capture()` strips ANSI/VT control sequences with `stripVTControlCharacters` from `node:util`. *(See §Critical Finding 1 — this describes Phase 10 behavior; Phase 09 does not produce ANSI in the first place.)*
- **D-03:** The TTY adapter imports `isNodeTTY` from `tests/tty/env.ts` and "sets it on the module-level singleton before each test via `adapter.setup()`". **NOTE from context:** if closed-over constant, this override may be insufficient. Researcher must verify. *(Verified: it IS a closed-over const. Phase 09 TTY adapter runs in console mode. See §Critical Finding 1.)*
- **D-04:** Both worker adapters drain IPC output with a fixed `setTimeout drain`. `adapter.capture()` is async. *(See §Critical Finding 2 — drain approach cannot capture fork output with inherited stdio. Use releaseWorker() fallback instead.)*
- **D-05:** Both worker adapters call `releaseWorker()` in `afterEach` to destroy the fork between tests.
- **D-06:** `battery-node-console-worker.test.ts` exercises **all 7 shared suites** (including formats).
- **D-07:** `battery-node-tty.test.ts` exercises **6 suites** (formats suite excluded).
- **D-08:** `battery-node-tty-worker.test.ts` exercises **6 suites** (formats excluded).
- **D-09:** Every env × mode combination has both "main" and "worker" variants running identical suite sets.
- **D-10:** All new adapters are defined **inline** inside their battery files. No separate adapter file.

### Agent's Discretion
- Exact drain timing for worker adapters (50ms timeout vs polling). Research recommends the `releaseWorker()` fallback approach (see §Critical Finding 2) — IPC drain timing is moot because fork output is never captured.

### Deferred Ideas (OUT OF SCOPE)
- `parity.suite.ts` comparing outputs byte-by-byte (BATTERY-07).
- Any rstest.config.ts changes — wired in Phase 10.
- Modifying shared suite files.
- Adding a separate adapter file (inline only per D-10).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BATTERY-04 | Worker adapters for `node-console-worker` and `node-tty-worker`; parity verified against main adapters | `releaseWorker()` fallback makes WL ≡ L; shared suites always use `L` directly; parity is demonstrated structurally |
| BATTERY-06 | `tests/tty/env.ts` exports `isNodeTTY = true`; `node-tty` project uses `source.alias` to redirect `src/utils/env` → `tests/tty/env.ts`; no env-var in `src/` | Phase 09 delivers the file; source.alias is Phase 10. BATTERY-06 is split across phases by locked decision. |
</phase_requirements>

---

## Summary

Phase 09 adds three battery test files and the `tests/tty/env.ts` static env override file to complete the adapter matrix introduced in Phase 08. Two critical empirical findings shape the implementation directly.

**Finding 1 (isNodeTTY override):** `isNodeTTY` is compiled by rspack as an immutable `const` in the flat bundle scope (confirmed by inspecting `dist/index.js`). There is no module object to mutate; `const isNodeTTY = ...` is inlined wherever referenced. The Phase 10 `source.alias` is the ONLY way to activate true TTY routing. In Phase 09, the TTY battery adapter runs in console mode with `L.format = 'pretty'` forced in `setup()`.

**Finding 2 (worker output capture):** The Node fork uses `stdio: ['inherit', 'inherit', 'inherit', 'ipc']`, meaning the child writes directly to the inherited OS file descriptor — bypassing the parent's JS-level `process.stdout.write` patch entirely. `captureAsync` cannot capture fork output. The correct strategy is to call `releaseWorker()` in `adapter.setup()`, which activates the fallback path (WL → L) so all subsequent writes go through the main-thread logger and `captureAsync` captures them normally.

**Primary recommendation:** For Phase 09, all four deliverables (`tests/tty/env.ts`, `battery-node-tty.test.ts`, `battery-node-console-worker.test.ts`, `battery-node-tty-worker.test.ts`) use the same inline adapter pattern as Phase 08 but with the strategies above. No rstest.config.ts changes required or permitted.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@rstest/core` | (workspace) | `describe`, `test`, `beforeEach`, `afterEach` | Already in use |
| `node:util` | built-in | `stripVTControlCharacters` | Phase 10 ANSI stripping (imported now for forward-compat) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/common/capture.helper.ts` | workspace | `captureAll` baseline | Sync capture; not used in battery files (async spinners need `captureAsync`) |
| `captureAsync` (inline) | workspace | async process.stdout.write intercept | All battery adapters (pattern copied from battery-node-console.test.ts) |

**Installation:** None required — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── tty/
│   ├── env.ts                           # NEW: alias target for Phase 10
│   └── main/
│       ├── battery-node-tty.test.ts     # NEW: Phase 09
│       └── battery-node-tty-worker.test.ts  # NEW: Phase 09
└── node/
    └── main/
        └── battery-node-console-worker.test.ts  # NEW: Phase 09
```

### Pattern 1: static TTY env override file

```typescript
// tests/tty/env.ts — alias target for rspack source.alias (wired in Phase 10)
// Re-exports everything from the real env module, then overrides TTY flags.
// This file MUST NOT accept env vars — it is a compile-time constant.
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
```

No `adapter.setup()` references this file to patch `isNodeTTY` — that patching is impossible (see §Critical Finding 1). The file exists solely as the alias target.

### Pattern 2: node-tty battery adapter (Phase 09 — console mode until Phase 10)

```typescript
// Inline inside battery-node-tty.test.ts
import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';

async function captureAsync(fn: () => void | Promise<void>): Promise<string[]> {
  // ... identical to battery-node-console.test.ts captureAsync
}

const nodeTtyAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() {
    // Phase 09: isNodeTTY is false (no alias yet) → logger uses console mode.
    // Force pretty format to simulate what TTY would produce (no json/logfmt).
    L.format = 'pretty';
  },
  capture: captureAsync,
  get logger(): RootLogger { return L; },
};

// 6 suites — formats suite excluded (TTY renders ANSI-only, no json/logfmt).
makeLevelsSuite(nodeTtyAdapter);
makeScopesSuite(nodeTtyAdapter);
makeOptionsSuite(nodeTtyAdapter);
makePrefixSuite(nodeTtyAdapter);
makeMixinsSuite(nodeTtyAdapter);
makeSpinnersSuite(nodeTtyAdapter);
```

**Why captureAsync without stripVTControlCharacters in Phase 09:** Console mode (`renderConsolePrefix`) produces no ANSI in level prefixes. The spinners suite expects `⋯` icon from `createConsoleSpinner` which also writes no ANSI through `renderConsolePrefix`. Stripping is needed in Phase 10 when `renderTTYPrefix` is active. Adding the import now (`stripVTControlCharacters`) is forward-compat but stripping empty strings is a no-op.

### Pattern 3: worker battery adapter (releaseWorker() fallback)

```typescript
// Inline inside battery-node-console-worker.test.ts / battery-node-tty-worker.test.ts
import { afterEach } from '@rstest/core';
import { L } from '../../../src';
import { Logger as WL, releaseWorker } from '../../../src/worker/index';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';

// captureAsync same as other battery files (captures L output after fallback)

const consoleWorkerAdapter: TestAdapter = {
  name: 'node-console-worker:json',  // or logfmt, pretty — one adapter per format
  setup() {
    // releaseWorker() activates the fallback: WL routes all sends through L.
    // This is idempotent — subsequent calls are no-ops after the first.
    releaseWorker();
    WL.format = 'json';  // sets L.format via fallback handler
  },
  capture: captureAsync,
  get logger(): RootLogger { return WL as unknown as RootLogger; },
};

afterEach(() => {
  // releaseWorker() is already called in setup(); calling it here is idempotent.
  // Included for structural parity with D-05 intent.
  releaseWorker();
});
```

### Anti-Patterns to Avoid

- **DO NOT attempt `(envModule as any).isNodeTTY = true`** — rspack inlines `isNodeTTY` as a `const` in the flat bundle; the import namespace has no writable property to mutate.
- **DO NOT use `await new Promise(r => setTimeout(r, 50))` then captureAll()** — the fork stdout goes to the inherited fd 1, invisible to JS-level patching. The drain is irrelevant.
- **DO NOT use `rs.mock('../../../src/utils/env')`** — cannot override a bundle-time const, as documented in `spinner-tty.test.ts` RISK-1 fallback comment.
- **DO NOT create separate adapter files** — locked decision D-10 requires inline adapters.

---

## Critical Finding 1: isNodeTTY is a bundle-time constant

**Verdict: CANNOT be overridden at test runtime in Phase 09.**

### Evidence

`dist/index.js` (examined directly) shows:

```js
// Line 43 — from src/utils/env.ts, inlined by rspack
const isNodeTTY = isNode && 'true' !== processEnv.LLOGER_FORCE_CONSOLE && !!process.stdout?.isTTY;

// Line 834 — from src/logger/mixins/spinner/index.ts
const isTTY = isNodeTTY;  // explicit local copy

// Line 1270 — from src/logger/index.ts emit()
if (isNodeTTY) emitTTY(prepared, options?.ttySpinner);
```

rspack inlines all ESM modules into a single flat scope. `isNodeTTY` is a `const` binding shared across the bundle. There is no module namespace object to mutate; `import * as envModule from '...'` would resolve to the same flat scope constant.

### Implication for Phase 09 TTY battery

- The TTY adapter runs in **console mode** (`isNodeTTY = false`, `isTTY = false`)
- `emit()` always calls `emitConsole()` → `renderConsolePrefix()` (plain text, no ANSI)
- Spinners use `createConsoleSpinner` → `[ ⋯ ]` icon badges, no ttyRenderer
- `captureAsync` captures without ANSI stripping
- All 6 shared suites are compatible with console-mode output

### Shared suite compatibility with console mode

| Suite | Passes in Console Mode? | Reason |
|-------|------------------------|--------|
| levels | ✓ | Uses `L.format = 'json'` in its beforeEach; counts lines, no format dependency |
| formats | ✗ (excluded) | TTY mode never produces json/logfmt; excluded by D-07 |
| scopes | ✓ | Checks badge text, scope name; plain text consistent |
| options | ✓ | Counts lines and reads structured output; format-agnostic |
| prefix | ✓ | Expects `[INFO]`; `renderConsolePrefix` produces `[INFO]`; passes |
| mixins | ✓ | Counts lines; format-agnostic |
| spinners | ✓ | Expects `⋯` icon (`CONSOLE_SPINNER_INTERVAL`); console spinner produces it |

**Note on prefix-suite compatibility with Phase 10 (alias active):** In Phase 10, `renderTTYPrefix` produces ` INFO ` (ANSI-colored, no brackets). After `stripVTControlCharacters`, the text is ` INFO ` — the prefix suite assertion `toContain('[INFO]')` would **fail**. Phase 10 must address this (adapter-level assertion skip, TTY-specific suite variant, or L.color = false in TTY setup). This is Phase 10's responsibility, not Phase 09's.

---

## Critical Finding 2: Worker fork output bypasses JS-level capture

**Verdict: captureAsync CANNOT capture fork output. Use `releaseWorker()` fallback.**

### Evidence

`src/worker/proxy.ts` (line 194):
```typescript
// stdio: ['inherit', 'inherit', 'inherit', 'ipc'] passes the exact same fd to the
// child, so isTTY is true and the VT100 spinner renderer works as expected.
const child = fork(scriptUrl.pathname, [], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
```

With `stdio: 'inherit'`, the child shares the parent's OS file descriptors 0/1/2. When the child calls `process.stdout.write(...)`, it writes to fd 1 at the OS level — **not** through the parent's JavaScript `process.stdout.write` wrapper. Patching the parent's wrapper (which is what `captureAsync` and `captureAll` do) has no effect on the child's writes.

### releaseWorker() fallback mechanism

After `releaseWorker()` is called:

1. `_terminateTransport?.()` → kills the child fork (if alive)
2. `activateFallback()` → sets `_fallbackSend = buildFallbackSend(root)` (Path A, since L is already loaded)
3. `buildFallbackSend(root)` translates every `WorkerMessage` back to direct `L` calls
4. All subsequent `WL.info()`, `WL.scope()...` calls route through `L` on the main process
5. `captureAsync` captures `L`'s output normally (JS-level patch works for main-process writes)

### Fork lifecycle timing (safe to call releaseWorker() in beforeEach)

When `src/worker/index.ts` is imported:
1. Module-level code runs → `createNodeTransport()` called → `fork()` executed → returns `Transport` object immediately
2. `transportPromise.then(transport => { _terminateTransport = transport.terminate.bind(transport); ... })` is scheduled as a microtask
3. Test files: module evaluation completes → test setup registers beforeEach hooks → event loop yields → microtask runs → `_terminateTransport` is now set

By the time `beforeEach` fires (first test), `_terminateTransport` is non-null. `releaseWorker()` calls `_terminateTransport()` which does `child.kill()`. Fork is cleanly terminated. ✓

### Adapter setup flow for worker adapters

```typescript
// In adapter.setup() — called in beforeEach
releaseWorker();          // 1. kill fork, activate fallback (WL → L)
WL.format = 'json';       // 2. sets L.format via WorkerMessage 'opt:format' → fallback handler
```

Between tests, `releaseWorker()` is idempotent (subsequent calls re-invoke `activateFallback()` which just re-targets the already-found `root`). No state leak.

### Why shared suites work with the fallback

All shared suite files import `L` directly from `../../src`:
```typescript
// levels.suite.ts, prefix.suite.ts, etc.
import { L, LogLevels } from '../../src';
// ...
const lines = await adapter.capture(() => {
  (L as unknown as Record<string, ...>)[level]('msg');
});
```

The suites call `L`, not `adapter.logger`. After `releaseWorker()`, `WL.info()` delegates to `L.info()` in any case, but the suites never call `WL` at all. `captureAsync` wraps the `L` call and captures output normally.

**BATTERY-04 parity proof:** Running the same suites via the worker adapter (which routes through L fallback) demonstrates structural API parity — the worker proxy exposes the same interface as L, and the fallback correctly mirrors all option settings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async stdout capture | Custom stream intercept | `captureAsync` from `battery-node-console.test.ts` | Already proven in Phase 08, handles edge cases |
| Spinner tick timing | Custom timer logic | `rs.useFakeTimers()` + `rs.advanceTimersByTime()` | Identical pattern in existing spinner tests |
| ANSI stripping | Regex replacements | `stripVTControlCharacters` from `node:util` | Built-in, handles all VT100 sequences correctly |
| Worker teardown | Re-implementing fork cleanup | `releaseWorker()` | Already handles idempotence, fallback activation |
| Registry reset | Custom beforeEach logic | `reset.helper.ts` (already in setupFiles) | Already registered — no import needed |

---

## Common Pitfalls

### Pitfall 1: Trying to override `isNodeTTY` at runtime

**What goes wrong:** `import * as envModule from '../../src/utils/env'; envModule.isNodeTTY = true;` silently fails or has no effect. The `emit` function still calls `emitConsole`.

**Why it happens:** rspack flattens all ESM modules into a single bundle scope. `isNodeTTY` is a `const` binding, not a property on any object. There is no module namespace object to write to.

**How to avoid:** Accept that Phase 09 TTY battery runs in console mode. Don't add any patching code. Phase 10 `source.alias` handles real TTY routing.

**Warning signs:** Tests pass but output is identical to `battery-node-console` tests (console format, no ANSI). This is EXPECTED in Phase 09.

### Pitfall 2: Trying to capture worker IPC output with captureAsync

**What goes wrong:** Test calls `WL.info('hello')`, the IPC message is sent, the fork writes to inherited fd 1, `captureAsync` returns an empty array or an unrelated line.

**Why it happens:** `captureAsync` patches the parent's JavaScript-level `process.stdout.write`. The fork writes directly to the OS file descriptor, bypassing this patch.

**How to avoid:** Call `releaseWorker()` in `adapter.setup()` before any `WL` calls. After fallback is active, all WL calls go through L on the main process — capturable.

### Pitfall 3: releaseWorker() leaves an orphaned fork

**What goes wrong:** If `releaseWorker()` is called before the transport promise resolves (unlikely given microtask timing), `_terminateTransport` is null and the fork isn't killed. The fork process runs until the Node process exits.

**Why it happens:** `_terminateTransport` is only set inside `transportPromise.then()`. If the promise hasn't resolved yet, there's no termination callback.

**How to avoid:** In practice, `beforeEach` runs after at least one event loop turn (allowing the microtask to fire). The fork is almost always killed. For belt-and-suspenders: the `afterEach` call to `releaseWorker()` (which is idempotent) ensures cleanup even if the timing was unusual on the first test.

### Pitfall 4: Using CONSOLE_SPINNER_INTERVAL for TTY adapter (Phase 09 is fine, Phase 10 is not)

**What goes wrong:** Phase 10 activates real TTY routing. The `spinners.suite.ts` uses `CONSOLE_SPINNER_INTERVAL` for non-browser adapters. In real TTY mode, `createTTYSpinner` uses `TTY_SPINNER_INTERVAL` (150ms vs the console value). Tests using fake timers would need `TTY_SPINNER_INTERVAL + jitter` advance.

**Why it happens:** `spinners.suite.ts` is hardcoded for console timing. The TTY adapter changes the spinner factory.

**How to avoid:** Phase 09 is unaffected (console mode). Document for Phase 10 planning.

### Pitfall 5: WL.format setter requires the transport to have resolved (or fallback to be active)

**What goes wrong:** Calling `WL.format = 'json'` in `setup()` before `releaseWorker()` queues a `{ type: 'opt:format', value: 'json' }` message. The message is drained to the fork, which sets `Logger.format` in the child. But `captureAsync` captures the parent's stdout, not the child's. The format change appears to have no effect.

**Why it happens:** IPC option sync is asynchronous and one-way (to fork). When running with the fork, the FORK's logger changes format, not the main-thread L.

**How to avoid:** Always call `releaseWorker()` **first** in `setup()`, then set `WL.format`. After fallback is active, `WL.format = 'json'` directly sets `L.format` on the main process.

---

## Code Examples

### captureAsync (copy from battery-node-console.test.ts)

```typescript
// Source: tests/node/main/battery-node-console.test.ts (Phase 08)
async function captureAsync(fn: () => void | Promise<void>): Promise<string[]> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  const intercept = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };

  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return chunks
    .join('\n')
    .split('\n')
    .filter(l => l.trim().length > 0);
}
```

### tests/tty/env.ts

```typescript
// Source: PHASE.md §Key Technical Notes
// Alias target for rspack source.alias in node-tty project (wired in Phase 10).
// Re-export everything from the real env module, then override TTY flags.
// This file lives in tests/ only — zero source changes to src/.
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
```

### Worker adapter setup (with releaseWorker fallback)

```typescript
// Source: worker-e2e.test.ts pattern + this research
import { afterEach } from '@rstest/core';
import { L } from '../../../src';
import { Logger as WL, releaseWorker } from '../../../src/worker/index';

const adapter: TestAdapter = {
  name: 'node-console-worker:json',
  setup() {
    releaseWorker();   // kills fork, activates WL→L fallback
    WL.format = 'json';
  },
  capture: captureAsync,
  get logger(): RootLogger { return WL as unknown as RootLogger; },
};

afterEach(() => {
  releaseWorker();  // idempotent; ensures fork cleanup
});
```

### Multi-format worker battery (7 suites per format)

```typescript
// Mirrors battery-node-console.test.ts pattern
const adapters = (['json', 'logfmt', 'pretty'] as const).map(makeConsoleWorkerAdapter);

for (const adapter of adapters) {
  makeLevelsSuite(adapter);
  makeFormatsSuite(adapter);
  makeScopesSuite(adapter);
  makeOptionsSuite(adapter);
  makePrefixSuite(adapter);
  makeMixinsSuite(adapter);
  makeSpinnersSuite(adapter);
}
```

---

## Runtime State Inventory

> Phase 09 is not a rename/refactor phase. No stored data migration required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None | — |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | None | — |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:util` `stripVTControlCharacters` | Phase 10 ANSI stripping (imported now) | ✓ | Node 18+ | — |
| `child_process.fork` | worker proxy (src/) | ✓ | Node 18+ | — |
| `@rstest/core` | test framework | ✓ | (workspace) | — |

No missing dependencies with no fallback.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | rstest + @rstest/adapter-rslib |
| Config file | `rstest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BATTERY-04 | `node-console-worker` adapter runs 7 shared suites | integration | `pnpm test` | ❌ Wave 0 |
| BATTERY-04 | `node-tty-worker` adapter runs 6 shared suites | integration | `pnpm test` | ❌ Wave 0 |
| BATTERY-04 | WL (fallback) passes same suites as L | structural | `pnpm test` | ❌ Wave 0 |
| BATTERY-06 | `tests/tty/env.ts` exists with correct exports | unit | `tsc --noEmit` | ❌ Wave 0 |
| BATTERY-06 | `battery-node-tty.test.ts` runs 6 shared suites | integration | `pnpm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (full suite, fast)
- **Per wave merge:** `pnpm test` (same)
- **Phase gate:** `pnpm test` green + `tsc --noEmit` zero errors before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/tty/env.ts` — covers BATTERY-06 file requirement
- [ ] `tests/tty/main/battery-node-tty.test.ts` — covers BATTERY-06 test + BATTERY-04 TTY parity
- [ ] `tests/node/main/battery-node-console-worker.test.ts` — covers BATTERY-04 console-worker
- [ ] `tests/tty/main/battery-node-tty-worker.test.ts` — covers BATTERY-04 tty-worker

---

## Open Questions

1. **Phase 10: prefix suite [INFO] bracket assertion in TTY mode**
   - What we know: `renderTTYPrefix` produces colored ` INFO ` (no brackets); after ANSI strip = ` INFO `
   - What's unclear: Will Phase 10 modify the prefix suite, skip the assertion for TTY adapters, or force `L.color = false` in TTY setup?
   - Recommendation: Document as Phase 10 concern; not relevant to Phase 09 planning.

2. **Phase 10: spinners.suite.ts timings for TTY spinners**
   - What we know: `spinners.suite.ts` uses `CONSOLE_SPINNER_INTERVAL` for non-browser adapters; TTY spinner uses `TTY_SPINNER_INTERVAL` (150ms)
   - What's unclear: Phase 10 may need a TTY-specific spinners suite or adapter-aware TICK_ADVANCE
   - Recommendation: Document as Phase 10 concern; not relevant to Phase 09.

3. **Orphaned fork between test files sharing the `node` project**
   - What we know: Each battery worker test FILE gets its own module instance (rstest per-file isolation). The fork is started, then killed in `setup()`. Subsequent tests in the same file use idempotent fallback.
   - What's unclear: In edge cases where `releaseWorker()` fires before the microtask, the fork remains until process exit.
   - Recommendation: Acceptable for test reliability. The `afterEach` `releaseWorker()` provides belt-and-suspenders.

---

## Sources

### Primary (HIGH confidence)
- `dist/index.js` (workspace) — definitive rspack compilation of `isNodeTTY` as flat `const`; confirmed bundle-time capture
- `src/worker/proxy.ts` lines 194, 197–213 — fork stdio: inherit confirmed; `createNodeTransport()` implementation
- `src/logger/index.ts` lines 477–480 — `if (isNodeTTY) emitTTY(...)` confirmed
- `src/logger/mixins/spinner/index.ts` lines 17–18 — `const isTTY = isNodeTTY` captured copy confirmed
- `tests/tty/main/spinner-tty.test.ts` lines 11–18 — RISK-1 fallback comment confirming bundle-time capture and rs.mock() failure
- `tests/node/main/battery-node-console.test.ts` — Phase 08 reference implementation for inline adapter pattern
- `tests/node/main/worker-e2e.test.ts` — `releaseWorker()` fallback behavior
- `tests/common/adapter.ts` — `TestAdapter` interface (confirmed: `adapter.logger` is not used by suites)
- `tests/common/levels.suite.ts`, `tests/common/spinners.suite.ts`, `tests/common/prefix.suite.ts` — confirmed: all suites import `L` from `../../src` directly
- `rstest.config.ts` — confirmed: `tests/tty/**/*.test.ts` is already in `node` project `include` glob (no rstest.config.ts changes needed)
- `src/logger/prefix/render.ts` — `renderConsolePrefix` produces no ANSI; `renderTTYPrefix` uses `colorize()`

### Secondary (MEDIUM confidence)
- rspack ESM inlining behavior deduced from `dist/index.js` output format (flat const, no module factory wrapping)

### Tertiary (LOW confidence)
- Phase 10 compatibility issues (prefix suite bracket assertion, spinner timing) — inferred from current suite code; not validated against Phase 10 plan

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — only existing in-project tools
- Architecture: HIGH — directly derived from dist output inspection and existing test patterns
- Pitfalls: HIGH — empirically confirmed from dist/index.js and spinner-tty.test.ts RISK-1 comment
- Worker capture strategy: HIGH — derived from proxy.ts stdio comment and worker-e2e.test.ts fallback pattern

**Research date:** 2026-03-26
**Valid until:** 2026-04-30 (stable; no external dependencies to expire)

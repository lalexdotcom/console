# Phase 04 Research: Worker Proxy & API Alignment

**Researched:** 2026-03-24
**Domain:** Worker IPC protocol, child_process mock, rstest module isolation
**Confidence:** HIGH (source code read directly) / MEDIUM (rs.mock dynamic import behaviour — requires canary test)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Transport testing strategy:** Hybrid — `rs.mock('node:child_process')` for unit
  tests (WORK-01..08), real WL proxy for WORK-09.
- **Test file structure:** Two files:
  `tests/node/main/worker-protocol.test.ts` (WORK-01..08) and
  `tests/node/main/worker-e2e.test.ts` (WORK-09 + API-01).
- **API-01 verification:** Both type-level (`WL satisfies RootLogger`) and runtime key
  enumeration (`Object.keys(WL)` vs hand-listed set).
- **Spinner IDs:** CONTEXT.md assumed `crypto.randomUUID()` — **CORRECTED by source
  read** (see §6): actual implementation uses a sequential `ws-N` counter.
- **Rate-limiting (WORK-07):** Proxy sends `key` + `max` in the `WorkerMessage`;
  counter lives in the worker. Tests verify message fields, NOT proxy deduplication.
- **Callsite capture (WORK-01):** Requires an `opt:set` `{ key: 'stack', value: true }`
  message to be sent first to enable caller capture.

### Agent's Discretion

- Exact assertion style for captured WorkerMessage arrays.
- Whether to use `rs.fn()` or plain closures for the mock child.
- Error message text for the exhaustiveness guard in the worker script.

### Deferred Ideas (OUT OF SCOPE)

- API-02: README and JSDoc updates — future docs phase.
- Browser `new Worker()` tests — no browser worker project in rstest.config.ts.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORK-01 | Worker proxy log dispatch sends WorkerMessage; worker emits correctly | §1, §2, §3 |
| WORK-02 | All WorkerMessage types handled: log, spin:*, opt:set, opt:format, opt:exclusive | §5.1 |
| WORK-03 | Unserializable args fall back to String() then '[unserializable]' | §5.2 |
| WORK-04 | Messages before transport ready are queued and flushed on connect | §2.3 |
| WORK-05 | Worker proxy scoped loggers send scope info in WorkerMessage | §5.3 |
| WORK-06 | Worker proxy option sync mirrors to proxy state + sends opt:set message | §5.4 |
| WORK-07 | Worker proxy rate-limiting (once/limit) sends key/max over IPC | §5.5 |
| WORK-08 | Worker proxy spinner lifecycle (spin:start/update/success/fail) messages work over IPC | §5.6 |
| WORK-09 | terminateWorker() kills worker, activates fallback logger, is idempotent | §3 |
| API-01 | WL exposes same public API surface as L | §4 |
</phase_requirements>

---

## 1. Transport Mock Feasibility

### 1.1 How the transport is initialised (source evidence)

`createWorkerProxy()` runs synchronously at module evaluation time and immediately
kicks off transport creation:

```typescript
// src/worker/index.ts  (inside createWorkerProxy(), runs at module load)
const transportPromise: Promise<Transport> = _isNode
  ? createNodeTransport()                    // async — dynamic import
  : Promise.resolve(createBrowserTransport()); // sync — Web Worker constructor

transportPromise.then((transport) => {
  resolvedTransport = transport;
  for (const msg of queue) transport.send(msg); // drain pre-ready queue
  queue.length = 0;
  silenceMainLogger();
});
```

`createNodeTransport()` uses `await import('child_process')` — a **dynamic import**,
not a static top-level import:

```typescript
// src/worker/index.ts
async function createNodeTransport(): Promise<Transport> {
  const { fork } = await import('child_process'); // ← dynamic, async
  // ...
  const child = fork(scriptPath, [], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    execArgv,
  });
  child.on('error', (err) => { /* ... */ });
  return {
    send: (msg) => { child.send(msg); },
    terminate: () => { child.kill(); },
  };
}
```

### 1.2 RISK-1 applicability

Phase 3 RISK-1 (`rs.mock('../../../src/utils/env')`) failed because rspack captured
`isNodeTTY` **statically** at bundle evaluation time — the value was frozen before the
mock factory could replace it.

For `child_process`, the situation is different:

| Factor | Phase 3 (env.ts) | Phase 4 (child_process) |
|--------|-----------------|------------------------|
| Import type | Static (`import { isNode }`) | Dynamic (`await import(...)`) |
| Capture timing | Bundle evaluation (synchronous) | Async microtask (after module evaluation) |
| Module location | Project-local, bundled by rspack | Node built-in, **externalized** by rspack |
| rs.mock intercept point | Before bundle evaluation | Before dynamic import resolves |

**Verdict:** RISK-1 is significantly lower for `child_process`. `rs.mock` is hoisted
before any import runs; the dynamic `await import('child_process')` resolves in a
microtask after module evaluation, so the mock registry should be active when it
resolves. **Confidence: MEDIUM** — canary test (WORK-01) confirms or denies.

### 1.3 Recommended mock structure

```typescript
// worker-protocol.test.ts
import { rs } from '@rstest/core';

// Captured references so individual tests can read out messages.
const capturedMessages: WorkerMessage[] = [];
let mockChild: { on: ReturnType<typeof rs.fn>; send: ReturnType<typeof rs.fn>; kill: ReturnType<typeof rs.fn> };

rs.mock('node:child_process', async () => ({
  fork: rs.fn((_scriptPath: string, _args: string[], _opts: unknown) => {
    mockChild = {
      on:   rs.fn(),                  // absorbs child.on('error', handler)
      send: rs.fn((msg: unknown) => { capturedMessages.push(msg as WorkerMessage); }),
      kill: rs.fn(),
    };
    return mockChild;
  }),
}));

// Import AFTER rs.mock declaration so the hoisted mock is in place.
import { WL } from '../../../src/worker';
import type { WorkerMessage } from '../../../src/worker/protocol';
```

**Note on async timing:** After `WL.info('test')` is called, the message lands in the
internal `queue` (transport promise not yet resolved). Tests must yield the event loop
before checking `capturedMessages`:

```typescript
// Flush microtask queue — lets createNodeTransport() resolve and drain the queue.
await new Promise<void>((resolve) => setImmediate(resolve));
// Now capturedMessages contains all messages sent so far.
```

### 1.4 Fallback plan if rs.mock fails (RISK-1 materialises)

If the canary in WORK-01 fails (messages do not appear in `capturedMessages`), the
recommended fallback is to test **the worker script handler directly** for WORK-01..08,
using `handle()` calls with synthetic `WorkerMessage` objects and `captureAll()` on
stdout. This tests message handling (the worker side) rather than message serialization
(the proxy side).

```typescript
// Fallback pattern — tests worker.ts handle() directly via stdout capture
import { captureAll } from '../../helpers/capture';
import { Logger } from '../../../src/logger';

// Simulate what the proxy would send, and verify what the worker produces.
// Called from inside worker.ts bootstrap (process.on('message', handle)).
// In this fallback, we invoke handle() directly.
```

However, this fallback **cannot test proxy serialization** (what WL actually sends).
If rs.mock fails, WORK-03 (unserializable args), WORK-04 (queue flush), WORK-07
(key/max fields), and WORK-08 (spinner IDs) would need to be verified via code review
rather than test assertions. Flag this to the planner as an open decision.

---

## 2. Recommended Test Architecture

### 2.1 File: worker-protocol.test.ts (WORK-01..08)

- Uses `rs.mock('node:child_process')` with hoisted mock.
- One shared `capturedMessages` array, cleared in `beforeEach`.
- Awaits `setImmediate` before assertions to allow transport Promise to resolve.
- Does **NOT** spawn a real child process.

```typescript
// Pattern for all WORK-01..08 tests
beforeEach(() => {
  capturedMessages.length = 0;
  // The WL singleton keeps the same underlaying send function — clearing the
  // captured array is sufficient to isolate between tests.
});

test('WORK-01 canary — WL.info sends log message', async () => {
  WL.info('hello worker');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(capturedMessages).toHaveLength(1);
  expect(capturedMessages[0]).toMatchObject({ type: 'log', level: 'info' });
  expect((capturedMessages[0] as { args: unknown[] }).args[0]).toBe('hello worker');
});
```

### 2.2 File: worker-e2e.test.ts (WORK-09 + API-01)

- Imports `WL`, `WorkerLogger`, `terminateWorker` from real path.
- Does NOT use `rs.mock`.
- Pre-populates `globalThis['$logger-registry']` with a fake `RootLogger` root to
  capture fallback dispatches after `terminateWorker()`.

```typescript
import { L } from '../../../src';
import { WL, WorkerLogger, terminateWorker } from '../../../src/worker';
```

### 2.3 Queue-before-ready test pattern (WORK-04)

The `queue` array inside `createWorkerProxy()` is a closure variable — not exported,
not accessible from tests. To verify WORK-04 (messages queued before transport ready):

```typescript
test('WORK-04 — messages posted before transport ready are queued and flushed', async () => {
  // WL is imported: transport promise is running but NOT yet resolved.
  // These calls go to the internal queue.
  WL.info('queued-1');
  WL.info('queued-2');

  // Resolve the transport promise by yielding the event loop.
  await new Promise<void>((resolve) => setImmediate(resolve));

  // Both messages must have reached the mock fork (in order).
  expect(capturedMessages).toHaveLength(2);
  expect(capturedMessages[0]).toMatchObject({ type: 'log', level: 'info' });
  expect(capturedMessages[1]).toMatchObject({ type: 'log', level: 'info' });
});
```

### 2.4 WL singleton reset caveat

`reset.ts` (global `setupFiles`) resets `globalThis['$logger-registry']` (the main
logger) but **does NOT reset `globalThis['$worker-logger-registry']`** (the worker
proxy singleton). Consequences:

- `_spinnerSeq` increments across tests — assert `typeof id === 'string'` and pattern
  `/^ws-\d+$/`, never a fixed value.
- `_fallbackSend` is null until `terminateWorker()` is called — `worker-protocol.test.ts`
  must never call `terminateWorker()` or subsequent tests will leak into fallback mode.
- Option mirror state (`_captureStack`, `_format`, etc.) persists between tests if
  option setters are called — restore in `afterEach`.

---

## 3. terminateWorker() Test Pattern

### 3.1 Source reality: `_terminateTransport` is never set

**Critical finding from source inspection:**

```typescript
// src/worker/index.ts — module level
let _terminateTransport: (() => void) | null = null;  // ← always null

export function terminateWorker(): void {
  _terminateTransport?.();        // null?.() → no-op; fork is NOT killed
  _terminateTransport = null;     // already null
  activateFallback();             // ← this IS what happens
}
```

`_terminateTransport` is declared at line 83, used at lines 92–93, but **never
assigned** anywhere in the file. The `transportPromise.then()` block sets
`resolvedTransport` but does NOT wire `_terminateTransport = () => transport.terminate()`.

**Practical consequence:** Calling `terminateWorker()` does **not** kill the fork
process. The child process continues to run until the parent process exits (natural
cleanup via inherited file descriptors). Only `activateFallback()` runs, routing
subsequent WL calls through the main-thread logger.

The requirement "kills worker" in WORK-09 cannot be verified via the public API with
the current source. The test should focus on:
1. **Fallback activation** — verifiable via output redirection
2. **Idempotency** — second call is safe (no throw)

### 3.2 activateFallback() mechanics

```typescript
function activateFallback(): void {
  const reg = (globalThis as Record<string, unknown>)['$logger-registry'] as
    | { root?: RootLogger } | undefined;

  if (reg?.root) {
    // PATH A (common): L already loaded — connect immediately.
    restoreMainLogger();
    const root = reg.root;
    // Replays all mirrored option state onto the fallback root.
    root.stack = _captureStack;  root.enabled = _enabled; /* ... */
    _fallbackSend = buildFallbackSend(root);
    return;
  }
  // PATH B (rare): L not loaded — buffers messages during dynamic import.
  const pending: WorkerMessage[] = [];
  _fallbackSend = (msg) => { pending.push(msg); };
  import('../logger').then(({ Logger }) => { /* ... drain pending ... */ });
}
```

After `terminateWorker()`, the `send()` function inside the proxy checks `_fallbackSend`
first and routes ALL messages there, bypassing the IPC transport entirely.

### 3.3 E2E test for WORK-09

```typescript
// worker-e2e.test.ts
import { L } from '../../../src';
import { WL, terminateWorker } from '../../../src/worker';
import { captureAll } from '../../helpers/capture';

test('WORK-09 — terminateWorker() activates fallback logger', () => {
  // Ensure L (the main logger) is loaded so activateFallback() takes Path A.
  // Importing L in the same file guarantees $logger-registry is populated.
  L.format = 'json';

  terminateWorker();

  // After termination, WL routes through the fallback (L).
  // Capture stdout to verify a real log line is produced.
  const { stdout } = captureAll(() => {
    WL.info('after-terminate');
  });

  expect(stdout).toHaveLength(1);
  const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
  expect(parsed.severity).toBe('info');
  expect(parsed.msg).toBe('after-terminate');
});

test('WORK-09 — terminateWorker() is idempotent (second call does not throw)', () => {
  // At this point terminateWorker() was already called in the previous test.
  // _fallbackSend is already set. activateFallback() will re-run (Path A) safely.
  expect(() => terminateWorker()).not.toThrow();

  // WL still works after second terminate.
  const { stdout } = captureAll(() => { WL.info('idempotent'); });
  expect(stdout).toHaveLength(1);
});
```

**Important:** `worker-e2e.test.ts` must import `WL` AND import `L` in the same file so
`$logger-registry` is populated before `terminateWorker()` runs. Otherwise
`activateFallback()` takes the slower Path B (dynamic import).

**Important:** Once `terminateWorker()` is called in this test file, ALL subsequent
`WL.info()` calls in this file are routed through the fallback. The API-01 tests
(verifying `WL`'s surface) must run **before** WORK-09 calls `terminateWorker()`, or
after, knowing output goes through L.

---

## 4. API-01 Verification Pattern

### 4.1 Exports from src/worker/index.ts

```typescript
// Singleton on globalThis['$worker-logger-registry']
export const workerLoggerSingleton: RootLogger;
export { workerLoggerSingleton as WorkerLogger, workerLoggerSingleton as WL };
export function terminateWorker(): void;
```

### 4.2 Type-level test (TypeScript assignability)

```typescript
// Type test — fails to compile if WL's shape is not assignable to RootLogger.
import type { RootLogger } from '../../../src/types';
const _typeCheck: RootLogger = WL; // ← if this line has no TS error, WL ⊆ RootLogger
void _typeCheck;

// WL and WorkerLogger are identical references.
test('WL and WorkerLogger are the same object', () => {
  expect(WL).toBe(WorkerLogger);
});
```

### 4.3 Runtime key enumeration

WL properties use `Object.defineProperty` with `enumerable: true`, so `Object.keys()` works:

```typescript
test('API-01 — WL exposes same public methods as L', () => {
  // All 11 level methods + log + scope + once + limit + options + patch + unpatch
  // + bypass + restore + format + exclusive + all option getter keys.
  const expectedKeys = [
    // Level methods
    'emerg', 'alert', 'crit', 'error', 'warn', 'notice', 'success', 'info', 'verb', 'debug', 'wth',
    // Generic dispatch
    'log',
    // Scope / registry
    'scope',
    // Rate-limiting
    'once', 'limit',
    // One-shot override
    'options',
    // Console patch
    'patch', 'unpatch',
    // Bypass (no-op on proxy, present for interface compliance)
    'bypass', 'restore',
    // Internal (present on RootLogger interface)
    '__logFromMainProcess',
    // Options (enumerable via defineProperty)
    'enabled', 'level', 'pad', 'color', 'date', 'stack', 'uid', 'inspect',
    'format', 'exclusive',
  ];

  const wlKeys = Object.keys(WL);
  for (const key of expectedKeys) {
    expect(wlKeys, `WL missing key: ${key}`).toContain(key);
  }

  // Compare against L (the real logger).
  const lKeys = Object.keys(L);
  for (const key of lKeys) {
    expect(wlKeys, `WL missing L key: ${key}`).toContain(key);
  }
});
```

---

## 5. Key Source Contracts

### 5.1 WorkerMessage variants (all 9 types)

| `type` | Required fields | Optional fields |
|--------|----------------|-----------------|
| `'log'` | `level`, `args[]`, `ts` | `scope`, `caller`, `traceCaller`, `callerStructuredOnly`, `key`, `max` |
| `'spin:start'` | `id`, `level`, `message` | `scope`, `options` (SpinnerOptions) |
| `'spin:update'` | `id`, `text` | `options` (SpinnerUpdateOptions) |
| `'spin:success'` | `id` | `text`, `options` |
| `'spin:fail'` | `id` | `text`, `options` |
| `'spin:stop'` | `id` | — |
| `'opt:set'` | `key: keyof LoggerOptions`, `value: unknown` | — |
| `'opt:format'` | `value: 'pretty' \| 'json' \| 'logfmt'` | — |
| `'opt:exclusive'` | `value: boolean` | — |

### 5.2 Serialization contract (WORK-03)

`cloneArg()` applies in order:
1. `structuredClone(arg)` — handles objects, arrays, Date, Map, Set, Error, ...
2. `String(arg)` — for functions, proxies, Symbol
3. `'[unserializable]'` — if even `String()` throws

```typescript
function cloneArg(arg: unknown): unknown {
  try { return structuredClone(arg); }
  catch {
    try { return String(arg); }
    catch { return '[unserializable]'; }
  }
}
```

Test for WORK-03:
```typescript
// non-cloneable: function → String()
WL.info((() => {}) as unknown as string);
expect(msg.args[0]).toMatch(/^(function|\(\) => {}).*|^\(\) => \{\}$/);

// truly unserializable: object that throws in toString:
const evil = Object.create(null);
Object.defineProperty(evil, 'toString', { get() { throw new Error(); } });
WL.info(evil);
expect(msg.args[0]).toBe('[unserializable]');
```

### 5.3 Scope proxy (WORK-05)

`WL.scope('name', opts)` builds a `WorkerScopeProxy` that prepends
`scope: { name, options }` to every `WorkerMessage`:

```typescript
// Every log from a scope proxy includes:
{
  type: 'log',
  level: 'info',
  scope: { name: 'my-scope', options: { level: 'debug' } },
  args: ['msg'],
  ts: /* Date.now() */,
}
```

Scope instances are cached: `WL.scope('x') === WL.scope('x')` (identity equality).

### 5.4 Option sync (WORK-06)

Each option setter mirrors locally AND posts an `opt:*` message:

| Option written | Message sent |
|---------------|--------------|
| `WL.stack = true` | `{ type: 'opt:set', key: 'stack', value: true }` → also sets `_captureStack = true` |
| `WL.format = 'logfmt'` | `{ type: 'opt:format', value: 'logfmt' }` → also sets `_format = 'logfmt'` |
| `WL.exclusive = true` | `{ type: 'opt:exclusive', value: true }` → also sets `_exclusive = true` |

All option getters return `undefined` (proxy is not the source of truth; worker is).

### 5.5 Rate-limiting (WORK-07)

`WL.once(key?)` / `WL.limit(n, key?)` delegate to `createWorkerLimitMixin` in
`src/worker/limit.ts`. The call-site key is captured in the **main process** via
`new Error().stack` (frame [3]), then forwarded to the worker:

```typescript
// Message from WL.once().info('msg'):
{
  type: 'log',
  level: 'info',
  args: ['msg'],
  key: 'at test.ts:12:10',   // call-site string (frame depth 3 in limit.ts)
  // max is absent → defaults to 1 (once semantics)
  ts: /* ... */,
}

// Message from WL.limit(3).info('msg'):
{
  type: 'log',
  level: 'info',
  args: ['msg'],
  key: 'at test.ts:12:10',
  max: 3,
  ts: /* ... */,
}
```

Test assertion: verify `key` is a non-empty string and `max` is the expected number
(or absent for `once`).

### 5.6 Spinner IDs — CORRECTION from CONTEXT.md

**CONTEXT.md was wrong.** The source uses a sequential counter, NOT `crypto.randomUUID()`:

```typescript
// src/worker/index.ts
let _spinnerSeq = 0;
function nextSpinnerId(): string {
  return `ws-${++_spinnerSeq}`;  // e.g. 'ws-1', 'ws-2', 'ws-3'
}
```

IDs are `ws-N` strings where N is monotonically increasing across the entire module
lifetime. Since `_spinnerSeq` is module-level and never reset, the N value in any
given test is unpredictable (depends on previous tests in the file).

**Test assertion:** `expect(typeof msg.id).toBe('string')` and optionally
`expect(msg.id).toMatch(/^ws-\d+$/)`. Never assert a fixed value like `'ws-1'`.

---

## 6. Risk Register

### RISK-1 — rs.mock of child_process may not intercept dynamic import
**Severity:** HIGH  
**Likelihood:** MEDIUM (lower than Phase 3 RISK-1 because child_process is externalized)  
**Detection:** WORK-01 canary test. If `capturedMessages` is empty after `setImmediate`,
the mock did not intercept.  
**Mitigation:** Canary assertion before suite continues. If it fires:
- Switch WORK-01..08 to testing the worker-side `handle()` function directly.
- Document which requirements cannot be fully verified (WORK-03, WORK-04, WORK-07,
  WORK-08 require proxy-side interception).

### RISK-2 — `_terminateTransport` is never set: fork is not killed
**Severity:** LOW (for tests) / MEDIUM (for production correctness)  
**Likelihood:** CERTAIN (confirmed by source: 3 occurrences of `_terminateTransport`,
none is an assignment after initialisation)  
**Impact on tests:** WORK-09 cannot test "kills worker process" via the public API.
Tests should focus on fallback activation and idempotency.  
**Recommendation:** Flag to architect — the omission looks intentional but the
docstring says "Stops the underlying worker/fork." Either the docstring is wrong or
the implementation is incomplete.

### RISK-3 — WL singleton is never reset between tests
**Severity:** MEDIUM  
**Detection:** `_spinnerSeq` out of sync; `_fallbackSend` leaks from WORK-09.  
**Mitigation:**
- Keep `worker-protocol.test.ts` and `worker-e2e.test.ts` in separate files (singleton
  is isolated per file by rstest's worker isolation).
- Never call `terminateWorker()` in `worker-protocol.test.ts`.
- Clear `capturedMessages` in `beforeEach` in `worker-protocol.test.ts`.
- Restore mutated option mirrors (`WL.enabled = true`, etc.) in `afterEach`.

### RISK-4 — setImmediate timing is non-deterministic in CI
**Severity:** LOW  
**Mitigation:** A single `await new Promise<void>(r => setImmediate(r))` is sufficient
to flush the microtask queue in Node.js. If this proves flakey, increase to
`await new Promise<void>(r => setTimeout(r, 50))`. Do NOT use `rs.useFakeTimers()`
in `worker-protocol.test.ts` as it affects Promise resolution timing.

### RISK-5 — Scope cache is not reset between tests
**Severity:** LOW  
**Impact:** If test A creates `WL.scope('foo')` and test B creates `WL.scope('foo')`,
they return the same proxy object (cache hit). Scope-level option mutations in test A
persist to test B.  
**Mitigation:** Use unique scope names per test (prefix with test ID), matching the
D-09 pattern from `mixins.test.ts`.

---

## 7. Recommended Plan Structure

### Plan 04-01: Worker Protocol Tests (WORK-01..08)

**File:** `tests/node/main/worker-protocol.test.ts`  
**Approach:** `rs.mock('node:child_process')` + fake child, `setImmediate` flush

| Wave | Tests | Requirements |
|------|-------|-------------|
| Wave 1 | WORK-01 canary (must pass before proceeding) | WORK-01 |
| Wave 2 | WORK-02, WORK-03, WORK-04 | message types, serialization, queue |
| Wave 3 | WORK-05, WORK-06 | scopes, option sync |
| Wave 4 | WORK-07, WORK-08 | rate-limiting, spinner lifecycle |

### Plan 04-02: E2E + API Alignment (WORK-09 + API-01)

**File:** `tests/node/main/worker-e2e.test.ts`  
**Approach:** Real WL import, L also imported for fallback path, `captureAll()` on output

| Test group | Contents | Requirements |
|------------|----------|-------------|
| API surface | Key enumeration, type assignment | API-01 |
| Fallback activation | `terminateWorker()` → `captureAll()` shows output | WORK-09 |
| Idempotency | Second `terminateWorker()` → no throw, WL still works | WORK-09 |

**Order matters:** API-01 tests must run before WORK-09 `terminateWorker()` is called
(to test WL methods while in proxy mode), OR after (testing them in fallback mode is
also valid for API-01, which only checks surface, not behaviour).

---

## Sources

### Primary (HIGH confidence — source code read directly)
- `src/worker/index.ts` — full file read; proxy structure, transport init, send function,
  fallback, spinner IDs, option setters, WL export
- `src/worker/protocol.ts` — full file read; all 9 WorkerMessage variants
- `src/worker/worker.ts` — full file read; handle() dispatch logic, bootstrap
- `src/worker/limit.ts` — full file read; createWorkerLimitMixin, key/max protocol
- `src/types.ts` — RootLogger interface, LoggerOptions, LogMethod, LoggerSpinner
- `tests/tty/main/spinner-tty.test.ts` — RISK-1 confirmed (rs.mock env.ts bypassed)
- `tests/node/main/mixins.test.ts` — test pattern reference (D-09: unique scope names)
- `tests/helpers/capture.ts` — captureAll() implementation
- `tests/helpers/reset.ts` — confirms reset.ts only resets `$logger-registry`
- `rstest.config.ts` — project structure, setupFiles, disableConsoleIntercept

### Secondary (MEDIUM confidence — inferred from Phase 3 artifacts)
- `tests/tty/main/spinner-tty.test.ts` note: rs.mock fallback pattern (bypass routing)
- CONTEXT.md decisions (constraints carried forward; RISK-1 fallback mentioned but
  proxy.ts does NOT exist — see §1.4)

## Metadata

**Confidence breakdown:**
- WorkerMessage protocol: HIGH — protocol.ts read directly
- Transport mock feasibility: MEDIUM — dynamic import behaviour requires canary test
- terminateWorker() mechanics: HIGH — source confirms `_terminateTransport` is never set
- Spinner IDs: HIGH — source uses `ws-N` counter, contradicts CONTEXT.md assumption
- API-01 surface: HIGH — exports read directly from index.ts

**Research date:** 2026-03-24  
**Valid until:** 2026-06-24 (stable codebase; no expected breaking changes)

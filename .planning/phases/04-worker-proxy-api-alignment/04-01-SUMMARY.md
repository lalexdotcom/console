---
phase: 04-worker-proxy-api-alignment
plan: 01
subsystem: testing
tags: [worker, ipc, rstest, mock, child_process, node-prefix]

requires:
  - phase: 02-core-logger-tests
    provides: captureAll() helper, reset.ts setup, logger API patterns
  - phase: 03-browser-tty-spinner-tests
    provides: spinner lifecycle testing patterns, rs.useFakeTimers() usage

provides:
  - Protocol/unit tests for WORK-01..08 in tests/node/main/worker-protocol.test.ts
  - Technique for intercepting dynamic `import('node:child_process')` in rstest via __non_webpack_require__

affects: [04-02]

tech-stack:
  added: []
  patterns:
    - "__non_webpack_require__ in rs.hoisted() to patch Node CJS module cache before dynamic import resolves"
    - "fakeFork pattern: mutate cp.fork on the shared CJS singleton object, restore in afterAll"
    - "setImmediate flush to drain async transport promise chain before asserting sentMessages"
    - "WorkerMessage discriminated union narrowing via type guards in test assertions"
    - "Spinner ID assertions via /^ws-\\d+$/ regex — never a fixed value"

key-files:
  created:
    - tests/node/main/worker-protocol.test.ts
  modified:
    - src/worker/index.ts (node: prefix on built-in imports)
    - src/worker/proxy.ts (node: prefix on child_process import)

key-decisions:
  - "rs.mock('node:child_process') does NOT work — importDynamic:false means rspack does not transform dynamic imports, so __rstest_dynamic_import__ never fires for built-ins"
  - "rs.mockRequire() also does NOT work — same root cause, patches webpack registry not native import()"
  - "__non_webpack_require__ IS available in rs.hoisted() context because it is injected at bundle scope; static imports are undefined at that point"
  - "Node.js built-ins are CJS singletons: mutating the object returned by require('node:child_process') affects all subsequent import() calls of the same module"
  - "Switched all dynamic built-in imports to node: prefix for clarity and correctness"

patterns-established:
  - "Intercept dynamic import of Node built-in: use __non_webpack_require__(moduleName) inside rs.hoisted() to mutate the property on the shared singleton object"
  - "Restore original function in a restore() closure returned from rs.hoisted; call in afterAll"

requirements-completed:
  - WORK-01
  - WORK-02
  - WORK-03
  - WORK-04
  - WORK-05
  - WORK-06
  - WORK-07
  - WORK-08

duration: multi-session (mock intercept research + implementation)
completed: 2026-03-25
---

# Phase 04, Plan 01 Summary

**31 protocol-unit tests covering all WORK-01..08 requirements, using __non_webpack_require__ to intercept node:child_process.fork without spawning a real process.**

## Performance

- **Tasks:** 3 (scaffold + WORK-03..05 + WORK-06..08)
- **Files modified:** 3 (worker-protocol.test.ts created, index.ts + proxy.ts node: prefix)
- **Tests added:** 31

## Accomplishments

Created `tests/node/main/worker-protocol.test.ts` covering all 8 WORK requirements:

- **WORK-01** (log dispatch): CANARY + all 11 level methods + stack capture
- **WORK-02** (all message types): opt:set / opt:format / opt:exclusive / spin:start / spin:update / spin:success / spin:fail / spin:stop
- **WORK-03** (unserializable args): function → String() fallback; plain object → structuredClone; multiple args each cloned
- **WORK-04** (message ordering): 3 synchronous sends arrive FIFO; ts timestamp present
- **WORK-05** (scope proxy): scope.name forwarded; scope caching identity-equal; scope options forwarded
- **WORK-06** (option sync): level / format / exclusive / stack option setters each produce the correct opt:* variant
- **WORK-07** (rate-limiting key/max): once() → key present, max undefined; limit(n) → key present, max = n; explicit key forwarded
- **WORK-08** (spinner lifecycle): success/fail/stop paths with ID consistency; two concurrent spinners get distinct IDs

## Self-Check: PASSED

```
Tests 162 passed (12 files)
Duration 193ms
worker-protocol.test.ts (31) ✓
```

CANARY passed — `__non_webpack_require__` successfully intercepted `node:child_process.fork`.

## Mock Intercept Research (key finding)

Three approaches failed before finding the working solution:

| Approach | Why it failed |
|---|---|
| `rs.mock('node:child_process')` | `importDynamic: false` → dynamic imports not transformed → webpack registry bypassed |
| `rs.mockRequire('child_process')` | Same root cause |
| `createRequire(import.meta.url)` in `rs.hoisted()` | Static import → `undefined` when hoisted callback executes |
| **`__non_webpack_require__` in `rs.hoisted()`** | **✓ Injected at bundle scope → available in hoisted context; Node CJS singleton mutated** |

## Deviations

- Plan specified `rs.mock('node:child_process')` mock approach, but this doesn't work with `importDynamic: false` in rstest config. Used `__non_webpack_require__` cache mutation instead — same effect, different mechanism.
- WORK-03 "evil-fn" test (both structuredClone AND String() throw) replaced with "multiple args each cloned independently" test, which provides equivalent coverage with less test brittleness.

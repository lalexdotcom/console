---
phase: 04-worker-proxy-api-alignment
plan: 02
subsystem: testing
tags: [worker, e2e, api-surface, fallback, terminateWorker, rstest]

requires:
  - phase: 04-01
    provides: worker-protocol.test.ts, worker module committed, WL singleton available
  - phase: 02-core-logger-tests
    provides: captureAll() helper, reset.ts beforeEach, L logger singleton

provides:
  - E2E tests for WORK-09 (terminateWorker fallback activation + idempotence)
  - API surface tests for API-01 (WL type-level + runtime parity with L)

affects: []

tech-stack:
  added: []
  patterns:
    - "API-01 describe before WORK-09 — test WL surface before terminateWorker() permanently switches to fallback"
    - "TypeScript type assignment `const _typeCheck: RootLogger = WL` as compile-time surface check"
    - "terminateWorker() is one-way — module-level _fallbackSend persists across all subsequent tests in the file"
    - "warn/error levels go to stderr not stdout — assertions use captureAll().stderr for warn/error"

key-files:
  created:
    - tests/node/main/worker-e2e.test.ts

key-decisions:
  - "_terminateTransport is declared but never assigned in src/worker/index.ts — fork is NOT killed by terminateWorker(). Tests verify only fallback activation, not process termination."
  - "warn → console.warn → stderr; error → console.error → stderr in json format. Tests 2 and 4 use captureAll().stderr"
  - "Importing L before WL in the test file ensures Path A (synchronous) in activateFallback()"

patterns-established:
  - "Import L before any terminateWorker() test to ensure Path A synchronous fallback"
  - "In json/logfmt format, warn/error/emerg/alert/crit go to stderr; info/notice/success/verb/debug/wth go to stdout"

requirements-completed:
  - WORK-09
  - API-01

duration: 30min
completed: 2026-03-25
---

# Phase 04, Plan 02 Summary

**9 E2E tests validating terminateWorker() fallback activation and WL API surface parity with L, using the real WL singleton without mocks.**

## Performance

- **Tasks:** 2 (API-01 surface checks + WORK-09 fallback/idempotence)
- **Files created:** 1 (worker-e2e.test.ts)
- **Tests added:** 9

## Accomplishments

### API-01 (5 tests)
- `WL === WorkerLogger` (same object reference) ✓
- All 11 log-level methods exist as callable functions ✓
- `WL.scope` is a function ✓
- Complete key set enumeration: all 32 expected keys present ✓
- No extra keys beyond L's surface ✓
- `const _typeCheck: RootLogger = WL` compiles at TypeScript level ✓

### WORK-09 (4 tests)
- First `terminateWorker()` call activates fallback → `WL.info(...)` produces JSON on stdout ✓
- Post-terminate `WL.warn(...)` routes to L (via stderr for warn level) ✓
- Second `terminateWorker()` call does not throw (idempotent) ✓
- `WL.error(...)` still produces output after idempotent terminate (stderr) ✓

## Self-Check: PASSED

```
Tests 171 passed (13 files)
Duration 273ms
worker-e2e.test.ts (9) ✓
```

## Known Bug Documented

`_terminateTransport` in `src/worker/index.ts` is declared but never assigned — the forked child process is NOT killed by `terminateWorker()`. This is RISK-2 from `04-RESEARCH.md §6`. The tests correctly test what IS testable (fallback activation) and do not assert on process termination.

## Bug: stdout vs stderr

Initial implementation used `stdout` for assertions on `warn` and `error` levels. Fixed after diagnosing: in json format, warn → `console.warn` → stderr, error → `console.error` → stderr. Corrected to use `captureAll().stderr` for those assertions.

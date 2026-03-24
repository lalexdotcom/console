---
phase: 03-browser-tty-spinner-tests
plan: 01
subsystem: testing
tags: [spinner, rstest, fake-timers, console-renderer]

requires:
  - phase: 02-core-logger-tests
    provides: captureAll() helper, reset.ts setup, L.scope() testing pattern

provides:
  - Console spinner tests (SPIN-01 through SPIN-06, SPIN-08) in tests/node/main/spinner-node.test.ts

affects: [03-02, 03-03]

tech-stack:
  added: []
  patterns:
    - rs.useFakeTimers() called inline per-test (not in beforeAll) to avoid rstest v0.9.4 hook TypeError
    - L.format = 'pretty' in file-level beforeEach to override reset.ts default (json)
    - interceptStdout() helper for timer-advancing tests (captureAll is synchronous only)
    - No async tests in fake-timer context (SPIN-04 uses real timers — exec resolves via microtask)

key-files:
  created:
    - tests/node/main/spinner-node.test.ts

# Implementation notes
decisions:
  - rs.useFakeTimers() called inline in tests that call advanceTimersByTime; afterAll/beforeAll
    hooks in rstest v0.9.4 throw "TypeError: fn is not a function" in teardown when wrapping
    useFakeTimers/useRealTimers — inline call avoids the hook registration issue entirely
  - L.format = 'pretty' required: reset.ts resets to 'json' before each test; icons (⋯, ✔, ✖)
    and bracket badges ([ ⋯ ]) are only rendered via renderConsolePrefix in 'pretty' format
  - SPIN-04 exec() uses real timers: Promise.resolve/reject resolves as microtask before any
    spinner setTimeout fires; success/fail clear the timeout immediately

---

## Self-Check: PASSED

All 20 tests pass. `pnpm test:node` exits 0 with 125 tests total.

### Requirements coverage
- SPIN-01: lifecycle (start/tick/update/success/fail/stop) ✓
- SPIN-02: terminal state idempotency (stop makes lifecycle calls no-ops) ✓
- SPIN-03: autoStart option (true/false/explicit start) ✓
- SPIN-04: exec() fulfilled and rejected with re-throw ✓
- SPIN-05: duration:true appends elapsed time suffix ✓
- SPIN-06: progress with ratio and {done,total} formats ✓
- SPIN-08: bracket badge format [ ⋯ ]/[ ✔ ]/[ ✖ ], no cursor control, error→stderr ✓

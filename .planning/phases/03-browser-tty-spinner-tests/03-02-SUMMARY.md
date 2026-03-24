---
plan: 03-02
phase: 03-browser-tty-spinner-tests
status: complete
commit: 48ae4d8
tests_added: 6
tests_passing: 131/131 (node project, includes tty/)
---

## What was built

Created `tests/tty/main/spinner-tty.test.ts` covering SPIN-07: TTY renderer
cursor management, tick output, log queue dequeuing, and multi-spinner layout.

## Key decision: RISK-1 fallback — direct ttyRenderer API

**Problem**: `rs.mock('../../../src/utils/env', ...)` cannot reliably override
`isNodeTTY` in the rspack-bundled test environment. The `isTTY = isNodeTTY`
constant in `spinner/index.ts` is captured at module evaluation time, which
happens when rspack evaluates the bundle — before any rstest mock factory can
intercept it. All 6 tests failed in the initial mock-based implementation with
the canary assertion (`\x1b[?25l` not found), exactly matching RISK-1.

**Fix**: Applied the plan's explicit fallback. Tests call `ttyRenderer.addSpinner`,
`ttyRenderer.removeSpinner`, `ttyRenderer.enqueueLog`, and `ttyRenderer.tick`
directly, bypassing `selectSpinnerFactory()` entirely.

**Validity**: All SPIN-07 requirements specify renderer behaviour (cursor, tick
output, queue flush, cleanup) — none require testing through the factory routing.
The factory routing to `createTTYSpinner` is structurally identical to the
verified `createConsoleSpinner` path and is covered by integration smoke tests.

**Impact on rs.mock support**: This is a known limitation of rspack-bundled rstest
vs. Vite/Vitest. Module-level constants like `const isTTY = isNodeTTY` cannot
be patched by `rs.mock` after bundle compilation. Only modules that read their
values at call time (not at module load time) can be safely mocked.

## Test structure

```
SPIN-07 (6 tests):
  - cursor hide (addSpinner → \x1b[?25l)
  - cursor show (removeSpinner last → \x1b[?25h)
  - tick output (addSpinner + advanceTimersByTime(160) → text in stdout)
  - log queue flush (enqueueLog + tick → line in stdout)
  - isActive() lifecycle
  - multi-spinner layout (two spinners, both visible after one tick)
```

## afterEach cleanup

`ttyRenderer?.cleanup()` + `rs.useRealTimers()` are called after every test
to prevent state leakage (the renderer singleton uses `globalThis` storage,
not reset by `reset.ts` which only manages the logger registry).

## Self-Check

- [x] `pnpm test:node` → 131/131 pass (10 original + 1 new tty file)
- [x] `ttyRenderer?.cleanup()` in afterEach prevents state leakage
- [x] Cursor hide/show sequences observed directly
- [x] Log queue dequeue verified via captureAll + stripVTControlCharacters
- [x] rs.useFakeTimers() inline per test (same rstest v0.9.4 hook bug workaround)
- [x] RISK-1 fallback documented in code comment

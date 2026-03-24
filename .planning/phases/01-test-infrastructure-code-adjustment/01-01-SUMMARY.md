---
phase: 01-test-infrastructure-code-adjustment
plan: 01
subsystem: testing
tags: [rstest, playwright, typescript, biome]

requires: []
provides:
  - rstest dual-project config (node + browser via Playwright)
  - shared test helpers: captureStdout, spyOnConsole, singleton reset
  - Node and browser smoke tests passing
  - TRACE_LEVELS fixed to include error and warn
affects: [phase-02-core-logger-tests, phase-03-browser-tty-spinner-tests, phase-04-worker-proxy]

tech-stack:
  added: [rstest@0.9.4, @rstest/adapter-rslib@0.2.1, @rstest/browser@0.9.4, playwright@1.58.2]
  patterns:
    - Functional wrapper helpers (captureStdout, spyOnConsole) — no shared mutable state
    - beforeEach registry reset via setupFiles (in-place mutation, not globalThis delete)
    - disableConsoleIntercept: true on node project to avoid conflict with logger patch/unpatch

key-files:
  created:
    - rstest.config.ts
    - tests/helpers/reset.ts
    - tests/helpers/stdout.ts
    - tests/helpers/console-spy.ts
    - tests/node/main/smoke.test.ts
    - tests/browser/main/smoke.test.ts
  modified:
    - package.json (scripts: test, test:node, test:browser; devDeps: @rstest/*)
    - tsconfig.json (include: added "tests")
    - src/levels.ts (TRACE_LEVELS: added 'error', 'warn')

key-decisions:
  - "disableConsoleIntercept: true on node project only — browser project handles console differently"
  - "Registry reset mutates in-place (not delete globalThis key) — the IIFE in logger/index.ts captures by closure"
  - "passWithNoTests: true on both projects — prevents failure when subdirs are empty"
  - "playwright installed as explicit peer dep (not assumed bundled in @rstest/browser)"

patterns-established:
  - "captureStdout pattern: intercept process.stdout.write, restore in finally"
  - "spyOnConsole pattern: intercept console methods including groupCollapsed, restore in finally"

requirements-completed: [ADJ-01, INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06]

duration: 15min
completed: 2026-03-24
---

# Phase 01: Test Infrastructure & Code Adjustment — Plan 01 Summary

**rstest dual-project test runner operational: Node smoke test runs in 122ms, browser smoke test runs in 511ms via headless Chromium, and TRACE_LEVELS now includes `error` and `warn` for browser call-site traces.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-03-24
- **Tasks:** 3/3 completed
- **Files modified:** 10

## Accomplishments

### Task 1 — Install rstest, configure dual projects, fix TRACE_LEVELS

Installed `@rstest/core@0.9.4`, `@rstest/adapter-rslib@0.2.1`, `@rstest/browser@0.9.4`, and `playwright@1.58.2`. Created `rstest.config.ts` with:
- **Node project** covering `tests/node/**` and `tests/tty/**` with `disableConsoleIntercept: true` (prevents conflict with logger's `patch()`/`unpatch()` console interception).
- **Browser project** covering `tests/browser/**` with headless Chromium via Playwright.
- Both projects use `setupFiles: ['./tests/helpers/reset.ts']` and `passWithNoTests: true`.

Added `test`, `test:node`, `test:browser` scripts to `package.json`. Extended `tsconfig.json` `include` to add `"tests"`.

Fixed `TRACE_LEVELS` in `src/levels.ts`: added `'error'` and `'warn'` to the Set (was `['emerg', 'alert', 'crit']`, now `['emerg', 'alert', 'crit', 'error', 'warn']`). No other code changes needed — `src/logger/index.ts` already checks `TRACE_LEVELS.has(logLevel)` to trigger `groupCollapsed`.

### Task 2 — Shared test helpers

Created `tests/helpers/stdout.ts`: `captureStdout(fn)` intercepts `process.stdout.write`, collects string chunks, restores original in `finally`. Named export only, no shared mutable state.

Created `tests/helpers/console-spy.ts`: `spyOnConsole(fn)` intercepts `['log', 'info', 'debug', 'warn', 'error', 'groupCollapsed', 'groupEnd']`, returns `ConsoleCall[]`, restores in `finally`. `groupCollapsed` included because `TRACE_LEVELS` causes the logger to wrap browser output in `console.groupCollapsed`.

### Task 3 — Smoke tests and verification

Created `tests/node/main/smoke.test.ts` and `tests/browser/main/smoke.test.ts`. All tests pass:
- `pnpm test:node` → 1 test passed (122ms)
- `pnpm test:browser` → 1 test passed (511ms)
- `pnpm test` → 2 tests passed (735ms)

All 6 new TypeScript files pass Biome lint/format checks with zero diagnostics.

## Deviations

None — implementation matches plan exactly. The `@rstest/browser` package exists as a standalone package (v0.9.4) and requires `playwright` as an explicit peer dependency.

## Self-Check: PASSED

- ✓ `pnpm test` exits 0 with both projects passing
- ✓ Node smoke test confirms Node environment (`typeof process === 'object'`)
- ✓ Browser smoke test confirms browser environment (`typeof document === 'object'`)
- ✓ `tests/helpers/reset.ts` has `beforeEach` with `$logger-registry` key
- ✓ `captureStdout` and `spyOnConsole` are named exports with `finally` blocks
- ✓ `TRACE_LEVELS` contains `'error'` and `'warn'`
- ✓ All 7 requirements covered: ADJ-01, INFRA-01–06

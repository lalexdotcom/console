---
plan: 09-02
phase: 09-env-adapters
status: complete
completed: 2026-03-26
---

## Summary

Created `tests/node/main/battery-node-console-worker.test.ts` (7 suites × 3 formats = 21 groups via releaseWorker() fallback) and `tests/tty/main/battery-node-tty-worker.test.ts` (6 suites × 1 format = 6 groups, formats excluded).

## Key Files

### Created
- `tests/node/main/battery-node-console-worker.test.ts` — inline `makeConsoleWorkerAdapter` factory (json/logfmt/pretty), `afterEach(() => releaseWorker())`, all 7 suites including formats
- `tests/tty/main/battery-node-tty-worker.test.ts` — inline `ttyWorkerAdapter` (pretty only), `afterEach(() => releaseWorker())`, 6 suites (formats excluded, mirrors battery-node-tty.test.ts)

## Decisions Made

- `releaseWorker()` called FIRST in every `setup()` before `WL.format = format` — order is critical to ensure fallback is active before format routing
- Both adapters use `captureAsync` (JS-level stdout.write patch) — captures only after fallback activation. Fork output via inherited stdio fd is NOT capturable.
- `setTimeout` drain anti-pattern explicitly avoided — fallback is synchronous after `releaseWorker()`
- `afterEach(() => releaseWorker())` at module level for belt-and-suspenders cleanup per D-05

## Verification

- `tsc --noEmit` exits 0
- `pnpm test` exits 0 — all 18 test files pass (1065 tests), including new node-console-worker and node-tty-worker groups
- `grep "makeFormatsSuite" tests/tty/main/battery-node-tty-worker.test.ts` → no match (intentional, D-08)
- `grep "setTimeout" tests/node/main/battery-node-console-worker.test.ts tests/tty/main/battery-node-tty-worker.test.ts` → no match (anti-pattern absent)

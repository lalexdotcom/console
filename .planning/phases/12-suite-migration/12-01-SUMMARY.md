---
plan: 12-01
phase: 12-suite-migration
status: complete
commit: 8ab0324
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-01: Suite setup? Hook

## What Was Built

Extended the `Suite` interface with an optional `setup?` field and updated `runSuite()` to invoke it in `beforeEach` after each adapter's own `setup()` call.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Add `setup?` field to Suite interface | ✓ | 8ab0324 |
| T-02 | Update runSuite() to invoke suite.setup?.(adapter) in beforeEach | ✓ | 8ab0324 |

## Key Files

### Modified
- `tests/common/suites/suite.ts` — Suite interface gains `setup?: (adapter: TestAdapter) => void | Promise<void>`
- `tests/common/suites/runner.ts` — beforeEach calls `suite.setup?.(mainAdapter)` then `suite.setup?.(workerAdapter)` (when present)

## Verification

- [x] `grep -n "setup?" tests/common/suites/suite.ts` returns line with correct typing
- [x] `grep -c "suite.setup" tests/common/suites/runner.ts` returns 4 (2 impl + 2 JSDoc)
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

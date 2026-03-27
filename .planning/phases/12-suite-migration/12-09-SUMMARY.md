---
plan: 12-09
phase: 12-suite-migration
status: complete
commit: 19b4021
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-09: spinners.suite.ts Migration

## What Was Built

New declarative `spinnersSuite` object at `tests/common/suites/spinners.suite.ts` with 20 test cases covering SPIN-01/02/03/04/05/06/08. Two private helper functions (`getTickAdvance`, `getRunningIcon`) replace factory closure constants.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Create tests/common/suites/spinners.suite.ts | ✓ | 19b4021 |

## Key Files

### Created
- `tests/common/suites/spinners.suite.ts` — 20 TestCase entries, setup: L.format='pretty', getTickAdvance/getRunningIcon helpers

## Verification

- [x] 20 `run: async` entries
- [x] `export const spinnersSuite` present
- [x] `setup` field sets `L.format = 'pretty'`
- [x] `getTickAdvance` and `getRunningIcon` helper functions present
- [x] No `makeSuite` factory
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

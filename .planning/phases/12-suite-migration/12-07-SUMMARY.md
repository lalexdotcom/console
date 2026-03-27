---
plan: 12-07
phase: 12-suite-migration
status: complete
commit: 19b4021
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-07: prefix.suite.ts Migration

## What Was Built

New declarative `prefixSuite` object at `tests/common/suites/prefix.suite.ts` with 20 test cases covering PREFIX-01/02/03/04. The badge `test.each` loop unrolled into 11 individual TestCase objects.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Create tests/common/suites/prefix.suite.ts | ✓ | 19b4021 |

## Key Files

### Created
- `tests/common/suites/prefix.suite.ts` — 20 TestCase entries, no setup field, no test.each

## Verification

- [x] 20 `run: async` entries
- [x] `export const prefixSuite` present
- [x] No `setup` field
- [x] No `test.each` pattern
- [x] EMERGENCY, ALERT, CRITICAL, VERBOSE, WHO CARES? labels all present
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

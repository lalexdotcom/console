---
plan: 12-03
phase: 12-suite-migration
status: complete
commit: 19b4021
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-03: levels.suite.ts Migration

## What Was Built

New declarative `levelsSuite` object at `tests/common/suites/levels.suite.ts` with 18 test cases covering CORE-01/02/03, plus a `setup` field that forces `L.format = 'json'`.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Create tests/common/suites/levels.suite.ts | ✓ | 19b4021 |

## Key Files

### Created
- `tests/common/suites/levels.suite.ts` — 18 TestCase entries, setup: L.format='json'

## Verification

- [x] 18 `run: async` entries
- [x] `export const levelsSuite` present
- [x] `setup` field sets `L.format = 'json'`
- [x] No `makeSuite` factory
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

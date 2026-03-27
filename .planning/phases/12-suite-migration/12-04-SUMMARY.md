---
plan: 12-04
phase: 12-suite-migration
status: complete
commit: 19b4021
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-04: formats.suite.ts Migration

## What Was Built

New declarative `formatsSuite` object at `tests/common/suites/formats.suite.ts` with 14 test cases covering CORE-04/05/06. No suite-level setup — each test sets `L.format` individually.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Create tests/common/suites/formats.suite.ts | ✓ | 19b4021 |

## Key Files

### Created
- `tests/common/suites/formats.suite.ts` — 14 TestCase entries, no setup field

## Verification

- [x] 14 `run: async` entries
- [x] `export const formatsSuite` present
- [x] No `setup` field
- [x] Imports `parseLogfmt` from `../logfmt.helper`
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

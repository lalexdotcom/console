---
plan: 12-02
phase: 12-suite-migration
status: complete
commit: a9eb28f
started: 2026-03-27T00:00:00Z
completed: 2026-03-27T00:00:00Z
---

# Plan 12-02: Extract normalise() Helper

## What Was Built

New file `tests/common/helpers/normalise.helper.ts` exporting two functions extracted verbatim from `parity.suite.ts`.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| T-01 | Create tests/common/helpers/normalise.helper.ts | ✓ | a9eb28f |

## Key Files

### Created
- `tests/common/helpers/normalise.helper.ts` — `normalise(s)` and `normaliseLines(lines)` named exports

## Verification

- [x] File exists at `tests/common/helpers/normalise.helper.ts`
- [x] Two `export function normalise*` entries (lines 13 and 32)
- [x] `pnpm exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

# Plan 08-01 Summary: Move parseLogfmt + Define TestAdapter

**Phase:** 08-shared-test-battery
**Plan:** 01
**Completed:** 2026-03-26T08:54:13Z
**Duration:** ~5 min
**Commit:** 7ccef04

## What Was Built

Wave 0 prerequisites for the shared test battery:

1. **Moved `parseLogfmt`** — `tests/node/main/logfmt.helper.ts` → `tests/common/logfmt.helper.ts`. All suite files in `tests/common/` can now import it via `./logfmt.helper`.
2. **Updated import** — `tests/node/main/formats.test.ts` now imports from `'../../common/logfmt.helper'`.
3. **Created `TestAdapter` interface** — `tests/common/adapter.ts` exports the single-source-of-truth contract for all adapters (BATTERY-01).

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Move parseLogfmt to tests/common/ | 7ccef04 | ✅ |
| 2 | Create tests/common/adapter.ts (TestAdapter) | 7ccef04 | ✅ |

## Verification Results

- `tests/common/logfmt.helper.ts` — EXISTS, exports `parseLogfmt`
- `tests/node/main/logfmt.helper.ts` — DELETED
- `tests/node/main/formats.test.ts` — imports from `'../../common/logfmt.helper'`
- `tests/common/adapter.ts` — exports `TestAdapter` with `name`, `setup()`, `capture()`, `readonly logger`
- `pnpm test` — 189 tests passed, 13 files, 0 regressions

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Coverage

- BATTERY-01: ✅ `TestAdapter` interface defined in `tests/common/adapter.ts`

## Next Phase Readiness

Wave 1 (plans 08-02, 08-03, 08-04) can start: `TestAdapter` is defined, `parseLogfmt` is accessible from `tests/common/`.

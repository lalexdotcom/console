# Plan 08-02 Summary: levels.suite.ts + formats.suite.ts

**Phase:** 08 — shared-test-battery
**Plan:** 02
**Commit:** 070d057
**Status:** COMPLETE

## What Was Built

Created the first two of seven parameterised suite files under `tests/common/`:

### `tests/common/levels.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- Covers CORE-01 (level dispatch), CORE-02 (filtering), CORE-03 (enabled toggle)  
- CORE-01: uses `test.each(LogLevels)` — iterates all 11 levels, checks each emits exactly 1 line
- CORE-02: 4 tests for threshold suppression (warn gate)
- CORE-03: 3 tests for enabled=false/true toggling

### `tests/common/formats.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- Covers CORE-04 (JSON format, 6 tests), CORE-05 (logfmt, 3 tests), CORE-06 (pretty, 5 tests)
- All tests set `L.format` explicitly — self-contained format tests
- Imports `parseLogfmt` from `./logfmt.helper`
- Preserves 3 inline snapshot assertions from the original `formats.test.ts`

## Key Decisions

- **LogLevels used in test.each** (CORE-01): `test.each(LogLevels)` iterates the canonical array from `src/levels.ts` — avoids hardcoding and makes the import meaningful
- **Flat array model**: All `captureAll({ stdout, stderr })` calls replaced with `adapter.capture()` returning `string[]`. Stream-specific assertions (`toHaveLength(0)` on the non-emitting stream) removed — cannot distinguish streams in flat array
- **L.format in levels suite**: Not set inline — trusted to `adapter.setup()` as per plan spec
- **L.format in formats suite**: Set explicitly per test — suite is format self-contained (CORE-04/05/06 each set their respective format)

## Deviations from Plan

None — plan executed exactly as written.

## Files Created

- `tests/common/levels.suite.ts` (83 lines)
- `tests/common/formats.suite.ts` (177 lines)

## Verification

- `tsc --noEmit`: zero errors
- `pnpm test`: 189 tests pass, zero regressions
- No `captureAll`, `process.stdout`, or `process.stderr` references in either file
- All test functions declared `async`

## Self-Check: PASSED

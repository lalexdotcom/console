# Plan 08-04 Summary: mixins.suite.ts + spinners.suite.ts

**Phase:** 08 — shared-test-battery
**Plan:** 04
**Commit:** 07195f4
**Status:** COMPLETE

## What Was Built

Created the final two Wave 1 suite files, completing the 7-file parameterised suite battery:

### `tests/common/mixins.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- MIX-01 (1 test): `once()` called 5× in a loop emits exactly once (same call-site key)
- MIX-02 (1 test): `limit(3)` called 10× emits exactly 3 times
- MIX-03 (1 test): explicit key groups 3 separate capture() calls under one shared counter
- MIX-04 (1 test): `options({date:true})` one-shot override doesn't mutate scope state
- 7 total `adapter.capture()` calls across 4 tests

### `tests/common/spinners.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- SPIN-01 (6 tests): full lifecycle — start, tick, update, success, fail, stop
- SPIN-02 (2 tests): terminal state idempotency (stopped spinner, double-success)
- SPIN-03 (3 tests): autoStart=true/false, explicit .start()
- SPIN-04 (2 tests): exec() fulfilled/rejected promise wrapping
- SPIN-05 (1 test): duration=true shows elapsed time suffix
- SPIN-06 (2 tests): progress bar rendering (ratio and fraction formats)
- SPIN-08 (4 tests): [ ⋯ ] / [ ✔ ] / [ ✖ ] bracket badge format

## Key Decisions

- **TICK_ADVANCE env selection**: `adapter.name.startsWith('browser')` selects between `BROWSER_SPINNER_INTERVAL` and `CONSOLE_SPINNER_INTERVAL` — browser and console use different tick rates
- **Fake timer placement**: `rs.useFakeTimers()` placed INSIDE `adapter.capture(fn)` so capture wrapper is active when timer callbacks fire
- **rs.useRealTimers() after capture**: Called after (not inside) each timer test to properly restore real timers between tests
- **Block bodies for LoggerSpinner methods**: Used `{ sp.stop(); }` instead of `() => sp.stop()` to avoid TypeScript error (LoggerSpinner methods return LoggerSpinner for chaining, not void)
- **SPIN-04 async fn**: `adapter.capture(async () => { await sp.exec(...) })` — TestAdapter.capture accepts `() => void | Promise<void>`

## Deviations from Plan

- **SPIN-08 test 4 name**: Renamed to `'error-level spinner routes final line to output'` (original had `'...to stderr'` but flat array model can't distinguish streams; test checks `lines.some(l => l.includes('✔'))` which is stream-agnostic)

## Files Created

- `tests/common/mixins.suite.ts` (88 lines)
- `tests/common/spinners.suite.ts` (238 lines)

## Verification

- `tsc --noEmit`: zero errors
- `pnpm test`: 189 tests pass, zero regressions
- No `captureAll`, `interceptStdout`, `process.stdout`, or `process.stderr` references in either file

## Self-Check: PASSED

# Plan 08-03 Summary: scopes.suite.ts, options.suite.ts, prefix.suite.ts

**Phase:** 08 — shared-test-battery
**Plan:** 03
**Commit:** ed5814d
**Status:** COMPLETE

## What Was Built

Created three more parameterised suite files under `tests/common/`:

### `tests/common/scopes.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- SCOPE-01 (2 tests): scope creation API check + JSON emit with scope field
- SCOPE-02 (2 tests): caching reference equality for same/different scope names
- SCOPE-03 (3 tests): date option cascade from root, scope override, isolation from root
- SCOPE-04 (2 tests): level mutation isolation between sibling scopes and from root

### `tests/common/options.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- OPT-01 (8 tests): round-trip getter/setter for all root logger options
- OPT-02 (4 tests): own > root > default option cascade
- OPT-03 (3 tests): strictest (lowest severity) level wins between root/scope
- OPT-04 (2 tests): util.inspect depth forwarding — browser-guarded (`adapter.name.startsWith('browser')`)
- Browser guard on `L.pad` default assertion (pad=false default in browser)

### `tests/common/prefix.suite.ts`
- Exports `makeSuite(adapter: TestAdapter): void`
- PREFIX-01 (11 tests via test.each): [LABEL] badge for each level in pretty format
- PREFIX-02 (3 tests): date bracket in pretty/logfmt output
- PREFIX-03 (3 tests): caller field in JSON via stack=true and TRACE_LEVELS
- PREFIX-04 (3 tests): scope bracket in pretty, scope field in JSON, root has no scope

## Key Decisions

- **Stream independence**: All `captureAll({ stdout, stderr })` replaced with `adapter.capture()` returning flat `string[]`. Stream-specific `toHaveLength(0)` assertions removed.
- **Browser guards in options.suite.ts**: `adapter.name.startsWith('browser')` used as guard for OPT-04 (util.inspect) and OPT-01 pad=true default — browser uses `isNode=false` so pad defaults to false
- **PREFIX-01 stream removal**: The `stream` parameter dropped from test.each tuples — `lines[0]` used directly for both stdout-bound and stderr-bound levels

## Deviations from Plan

None — plan executed exactly as written.

## Files Created

- `tests/common/scopes.suite.ts` (116 lines)
- `tests/common/options.suite.ts` (183 lines)
- `tests/common/prefix.suite.ts` (145 lines)

## Verification

- `tsc --noEmit`: zero errors
- `pnpm test`: 189 tests pass, zero regressions
- No `captureAll`, `process.stdout`, or `process.stderr` references in any of the three files

## Self-Check: PASSED

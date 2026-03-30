# P01 Summary — captureAsync + Browser Foundation

**Phase:** 13-directory-restructure
**Plan:** P01
**Wave:** 1
**Status:** Completed

## What Was Built

### Task 1: `captureAsync` export in `tests/common/capture.helper.ts`

Added async-safe stream capture function that:
- Patches `process.stdout.write` and `process.stderr.write`
- Awaits `fn()` (handles both sync and async callbacks)
- Restores original writers in a `finally` block
- Returns normalised lines (joined, split on `\n`, empty lines stripped)

Required by all battery adapters for SPIN-04 async spinner tests.

### Task 2: `tests/browser/adapter.ts` + `tests/browser/index.test.ts`

`browserAdapter`:
- Intercepts 5 console methods via `rs.spyOn` (log, warn, error, debug, groupCollapsed)
- Filters stack trace lines (`/^\s+at /`)
- Restores all spies in `finally`

`tests/browser/index.test.ts`:
- Runs 6 shared suites: levels, scopes, options, prefix, mixins, spinners
- `formats.suite` excluded (browser output is CSS `%c` format strings)

## Verification

- `captureAll` still present (untouched)
- `captureAsync` export confirmed: line 58
- `browserAdapter` exported with `name: 'browser-main'`
- `groupCollapsed` spy present (5th method)
- `formatsSuite` not imported

## Commit

`2c8fc86` — feat(tests): P13-P01 — add captureAsync helper, browser adapter and index test

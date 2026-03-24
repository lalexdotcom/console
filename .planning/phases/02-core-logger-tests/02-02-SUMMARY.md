---
phase: 02-core-logger-tests
plan: 02
subsystem: testing
tags: [rstest, node, levels, formats, json, logfmt, pretty, dispatch]

# Dependency graph
requires:
  - phase: 02-01
    provides: captureAll() and parseLogfmt() test helpers
provides:
  - "levels.test.ts — full 11-level stream routing, threshold filtering, enabled toggle (CORE-01, CORE-02, CORE-03)"
  - "formats.test.ts — JSON field contract, logfmt key=value contract, pretty bracket badges (CORE-04, CORE-05, CORE-06)"
affects: [02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable inline snapshot: normalise dynamic fields (timestamp) to placeholder before toMatchInlineSnapshot()"
    - "Level/severity distinction: level=console-method-name (error/warn/info/debug), severity=LogLevel string (emerg, etc.)"

key-files:
  created:
    - tests/node/main/levels.test.ts
    - tests/node/main/formats.test.ts
  modified: []

key-decisions:
  - "Dynamic timestamps replaced with '<ts>' placeholder before toMatchInlineSnapshot() to prevent wall-clock coupling"
  - "json format used in levels.test.ts to avoid TRACE_LEVELS pretty-mode stdout spillover into stderr tests"

patterns-established:
  - "Stable snapshot pattern: replace /\"time\":\"[^\"]*\"/ → '\"time\":\"<ts>\"' before snapshotting JSON lines"
  - "Logfmt stable snapshot: replace /time=\"[^\"]*\"/ → 'time=\"<ts>\"' before snapshotting"

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 02 Plan 02: Level Dispatch and Format Tests Summary

**Six core behavioral contracts now proven: all 11 levels route to the correct stream, threshold filtering suppresses as expected, and all three output formats (JSON, logfmt, pretty) emit correct field names without ANSI codes.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-24T15:54:44Z
- **Completed:** 2026-03-24T15:57:13Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Created `tests/node/main/levels.test.ts` with 3 describe blocks covering all 11 level→stream mappings (CORE-01), severity threshold filtering (CORE-02), and the enabled toggle (CORE-03) — 18 tests total
- Created `tests/node/main/formats.test.ts` with 3 describe blocks: JSON field contract with level/severity distinction and scope field (CORE-04), logfmt field order and emerg channel mapping (CORE-05), pretty bracket badges without ANSI codes (CORE-06) — 14 tests total
- Auto-fixed unstable inline snapshots that included dynamic timestamps (Rule 1 - Bug); replaced with stable `<ts>` placeholder pattern before snapshotting

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tests/node/main/levels.test.ts** - `7f17d00` (test)
2. **Task 2: Create tests/node/main/formats.test.ts** - `17289e2` (test)

## Files Created/Modified

- `tests/node/main/levels.test.ts` — Tests L.emerg/alert/crit/error/warn→stderr, all others→stdout, L.level threshold, L.enabled=false suppression
- `tests/node/main/formats.test.ts` — Tests JSON field contract (level=channel name, severity=LogLevel), logfmt key=value with field order, pretty [LABEL] badges

## Decisions Made

- Dynamic timestamps replaced with `'<ts>'` placeholder before `toMatchInlineSnapshot()` so snapshots validate field names and ordering without coupling to wall-clock time
- `L.format = 'json'` set at the start of every levels test to avoid the TRACE_LEVELS pretty-mode stdout spillover (emerg/alert/crit/error/warn in pretty format emit a stack trace to stdout after the main stderr line)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline snapshots with raw timestamps failed on second run**
- **Found during:** Task 2 (formats.test.ts)
- **Issue:** `toMatchInlineSnapshot()` auto-populated with literal ISO 8601 timestamps (e.g. `2026-03-24T15:55:48.750Z`); subsequent runs produced different timestamps and the assertions failed
- **Fix:** Replaced the two time-bearing snapshots with stable substitutions: JSON line uses `line.replace(/\"time\":\"[^\"]*\"/, '"time":"<ts>"')`, logfmt uses `line.replace(/time=\"[^\"]*\"/, 'time="<ts>"')` before snapshotting
- **Files modified:** `tests/node/main/formats.test.ts`
- **Verification:** Third consecutive `pnpm test:node` run passed without writing any new snapshots
- **Committed in:** `17289e2` (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Fix was necessary for stable CI — no scope creep.

## Issues Encountered

None beyond the snapshot stability fix above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 6 core behavioral contracts proven (CORE-01 through CORE-06)
- The `captureAll` + `parseLogfmt` helper pair is validated through real usage
- Wave 3 (prefix.test.ts, options.test.ts) can proceed immediately
- Stable snapshot pattern (`<ts>` placeholder) is now established for all subsequent format-asserting tests that include timestamps

---

## Self-Check

- [x] `tests/node/main/levels.test.ts` exists — 18 tests, 3 describe blocks
- [x] `tests/node/main/formats.test.ts` exists — 14 tests, 3 describe blocks
- [x] Task commits exist: `7f17d00`, `17289e2`
- [x] `pnpm test:node` exits 0 (33 tests pass, 3 test files)

## Self-Check: PASSED

---
*Phase: 02-core-logger-tests*
*Completed: 2026-03-24*

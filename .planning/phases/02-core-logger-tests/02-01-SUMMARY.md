---
phase: 02-core-logger-tests
plan: 01
subsystem: testing
tags: [rstest, node, capture, logfmt, helpers]

# Dependency graph
requires: []
provides:
  - captureAll() — parallel stdout+stderr stream capture for Node test helpers
  - parseLogfmt() — logfmt line parser (regex + JSON.parse, inverse of serializeLogfmt)
affects: [02-02, 02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stream intercept: bind original, override, try/finally restore (same as captureStdout)"
    - "Logfmt parse: regex /key=value|key=\"quoted\"/ + JSON.parse for quoted values"

key-files:
  created:
    - tests/helpers/capture.ts
    - tests/helpers/logfmt.ts
  modified: []

key-decisions:
  - "captureAll follows the same try/finally intercept pattern as existing captureStdout to ensure stream restoration on throw"
  - "parseLogfmt uses JSON.parse as the exact inverse of JSON.stringify used in serializeLogfmt"

patterns-established:
  - "captureAll pattern: intercept both streams simultaneously, restore in finally"
  - "logfmt parse pattern: regex + JSON.parse for quoted value unescaping"

requirements-completed: [CORE-01]

# Metrics
duration: 1min
completed: 2026-03-24
---

# Phase 02 Plan 01: Test Helper Utilities Summary

**Two foundational test utilities — `captureAll()` and `parseLogfmt()` — now give Wave 2 tests the tools to assert dispatch routing, output format, and logfmt field parsing.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-24T15:51:04Z
- **Completed:** 2026-03-24T15:51:59Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Created `tests/helpers/capture.ts` with `captureAll()` intercepting both `process.stdout.write` and `process.stderr.write` simultaneously with try/finally restoration
- Created `tests/helpers/logfmt.ts` with `parseLogfmt()` using regex + `JSON.parse` to correctly invert `serializeLogfmt`'s `JSON.stringify` output
- Both files use named exports only, strict TypeScript, English JSDoc — compliant with AGENTS.md conventions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tests/helpers/capture.ts with captureAll()** - `cdde35b` (feat)
2. **Task 2: Create tests/helpers/logfmt.ts with parseLogfmt()** - `1fef313` (feat)

## Files Created/Modified

- `tests/helpers/capture.ts` — Captures stdout+stderr chunks during callback execution; returns `{ stdout: string[], stderr: string[] }`
- `tests/helpers/logfmt.ts` — Parses a logfmt line into `Record<string, string>` using regex match + JSON.parse for quoted values

## Decisions Made

- `captureAll` extends the existing `captureStdout` pattern (same intercept/restore idiom) to avoid introducing a new pattern
- `parseLogfmt` uses `JSON.parse` deliberately because `serializeLogfmt` uses `JSON.stringify` for all values — this is the exact inverse

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- [x] `tests/helpers/capture.ts` exists and exports `captureAll`
- [x] `tests/helpers/logfmt.ts` exists and exports `parseLogfmt`
- [x] Both task commits exist: `cdde35b`, `1fef313`
- [x] `pnpm test:node` exits 0

## Self-Check: PASSED

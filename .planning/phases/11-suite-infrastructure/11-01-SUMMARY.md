---
phase: 11-suite-infrastructure
plan: 01
subsystem: testing
tags: [typescript, rstest, suite, runner, parity]

requires: []
provides:
  - "RunTestFunction type alias (tests/common/suites/suite.ts)"
  - "TestCase interface with name, parity, run fields"
  - "Suite interface with name, description, tests fields"
  - "runSuite() generic runner with parity support (tests/common/suites/runner.ts)"
affects: [12-suite-migration]

tech-stack:
  added: []
  patterns:
    - "Declarative suite contract: Suite/TestCase objects instead of imperative factories"
    - "Automatic worker parity: tc.parity !== false triggers workerAdapter re-run in same test()"

key-files:
  created:
    - tests/common/suites/suite.ts
    - tests/common/suites/runner.ts
  modified: []

key-decisions:
  - "parity field is optional on TestCase with no default — runner uses tc.parity !== false to apply the true default"
  - "describe/test/beforeEach imported from @rstest/core (not vitest or jest)"
  - "runSuite() uses a for…of loop to register test() (not forEach) for clarity and TypeScript compatibility"

patterns-established:
  - "Suite contract pattern: declarative object {name, tests[]} consumed by runSuite()"
  - "Parity pattern: same TestCase run against both mainAdapter and workerAdapter inside one test() body"

requirements-completed:
  - ARCH-01
  - ARCH-02

duration: 5min
completed: 2026-03-27
---

# Phase 11 Plan 01: Suite Infrastructure — Type Definitions & Runner

**Created the shared declarative suite contract and runSuite() runner that Phase 12 will use to migrate all test factories.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-27T12:00:00Z
- **Completed:** 2026-03-27T12:05:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (new files only)

## Accomplishments

- Created `tests/common/suites/suite.ts` with `RunTestFunction`, `TestCase`, and `Suite` — strict TS, no `any`, named exports only
- Created `tests/common/suites/runner.ts` with `runSuite()` — wraps describe/beforeEach/test from `@rstest/core`, auto-parity via `tc.parity !== false`
- `tsc --noEmit` exits cleanly; 781 node-console tests continue passing — zero regression

## Task Commits

1. **Task 1 + Task 2: suite.ts + runner.ts** — `6b454bb` (feat: add Suite/TestCase/RunTestFunction types and runSuite() runner)

## Files Created/Modified

- `tests/common/suites/suite.ts` — `RunTestFunction`, `TestCase`, `Suite` type definitions
- `tests/common/suites/runner.ts` — `runSuite(suite, mainAdapter, workerAdapter?)` implementation

## Decisions Made

- `parity` field on `TestCase` is optional with no default; runner applies `true` default via `tc.parity !== false` — avoids requiring consumers to set `parity: true` explicitly.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 12 (Suite Migration) can start immediately:
- `Suite`, `TestCase`, `RunTestFunction` are importable from `tests/common/suites/suite.ts`
- `runSuite` is importable from `tests/common/suites/runner.ts`
- Both files compile cleanly with the rest of the project

---
*Phase: 11-suite-infrastructure*
*Completed: 2026-03-27*

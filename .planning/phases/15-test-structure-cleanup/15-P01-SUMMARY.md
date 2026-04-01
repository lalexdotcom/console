---
phase: 15-test-structure-cleanup
plan: P01
subsystem: testing
tags: [rstest, test-structure, formats-suite]

requires:
  - phase: 13-directory-restructure
    provides: tests/console/{json,logfmt,pretty}/ adapter structure

provides:
  - tests/console/formats.suite.ts — formats suite co-located with console tests
  - Removed formats.suite.ts from tests/common/suites/ (console-only concern)
  - 3 console index.test.ts files now import from '../formats.suite'
affects: [suite-adapter-refactor]

tech-stack:
  added: []
  patterns: [Console-only suites live in tests/console/ not tests/common/suites/]

key-files:
  created: [tests/console/formats.suite.ts]
  modified:
    - tests/console/json/index.test.ts
    - tests/console/logfmt/index.test.ts
    - tests/console/pretty/index.test.ts

key-decisions:
  - "formats.suite.ts placed at tests/console/ root (not a suites/ subfolder) — flat placement sufficient for 3 importers"
  - "git mv used to preserve file history"

patterns-established:
  - "Console-only suites live in tests/console/, not tests/common/suites/"

requirements-completed: []

duration: ~5min
completed: 2026-03-30
---

# Phase 15-P01: formats.suite.ts relocated to tests/console/

**Moved the formats suite out of the shared common directory into the console-specific directory, correctly scoping JSON/logfmt/pretty format discrimination as a console-only concern.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-03-30
- **Tasks:** 4 completed (move file, update 3 importers)
- **Files modified:** 4

## Accomplishments

- Moved `tests/common/suites/formats.suite.ts` → `tests/console/formats.suite.ts`
- Deleted original from shared location (git mv preserves history)
- Updated import in `tests/console/json/index.test.ts`: `../../common/suites/formats.suite` → `../formats.suite`
- Updated import in `tests/console/logfmt/index.test.ts`: same change
- Updated import in `tests/console/pretty/index.test.ts`: same change
- 520 tests pass with 0 failures

## Verification

- `tests/console/formats.suite.ts` ✓ exists
- `tests/common/suites/formats.suite.ts` ✓ deleted
- All 3 console index.test.ts import from `'../formats.suite'` ✓
- `pnpm test` → 520 passed, 0 failed ✓

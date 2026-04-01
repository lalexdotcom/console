---
phase: 15-test-structure-cleanup
plan: P02
subsystem: testing
tags: [rstest, test-structure, directory-flatten]

requires:
  - phase: 13-directory-restructure
    provides: tests/browser/ and tests/tty/ directory structure with adapter files

provides:
  - tests/browser/browser.test.ts — browser spinner test at correct depth
  - tests/tty/spinner-tty.test.ts — TTY spinner test at correct depth
  - Removed tests/browser/main/ and tests/tty/main/ single-file subdirectories
affects: [suite-adapter-refactor]

tech-stack:
  added: []
  patterns: [Single-file subdirectories avoided — test files co-located at environment root]

key-files:
  created:
    - tests/browser/browser.test.ts
    - tests/tty/spinner-tty.test.ts
  modified: []

key-decisions:
  - "rstest.config.ts not changed — recursive globs (tests/browser/**, tests/tty/**) already cover flattened layout"
  - "Import depths reduced by 1 level: ../../../src → ../../src, ../../common → ../common"

patterns-established:
  - "Environment test directories are flat — no main/ subdirectories for single files"

requirements-completed: []

duration: ~5min
completed: 2026-03-30
---

# Phase 15-P02: tests/browser/main/ and tests/tty/main/ flattened

**Eliminated single-file main/ subdirectories from browser and TTY test directories, reducing navigation overhead with all imports corrected for the shallower depth.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-03-30
- **Tasks:** 3 completed (move browser test, move tty test, verify)
- **Files modified:** 2

## Accomplishments

- Moved `tests/browser/main/browser.test.ts` → `tests/browser/browser.test.ts`
  - Import depth: `../../../src` → `../../src` (3 import paths updated)
- Moved `tests/tty/main/spinner-tty.test.ts` → `tests/tty/spinner-tty.test.ts`
  - Import depth: `../../../src/...` → `../../src/...` and `../../common/...` → `../common/...`
- Deleted `tests/browser/main/` and `tests/tty/main/` directories
- `rstest.config.ts` unchanged — recursive globs already cover the flattened layout

## Verification

- `tests/browser/browser.test.ts` ✓ exists (correct import depths)
- `tests/browser/main/` ✓ deleted
- `tests/tty/spinner-tty.test.ts` ✓ exists (correct import depths)
- `tests/tty/main/` ✓ deleted
- `pnpm test` → 520 passed, 0 failed ✓

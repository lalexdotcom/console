---
plan: 12-10
status: complete
commit: ebdc9e9
wave: 3
---

# Plan 12-10 Summary — Wire Battery Tests to Declarative Suites

## What was built

Updated all 5 battery test files to use `runSuite()` with declarative suite objects
instead of `makeSuite()` factory calls. Deleted 7 obsolete factory files.

## Files modified

- `tests/node/main/battery-node-console.test.ts` — 7 makeSuite→runSuite calls, 7 imports replaced
- `tests/node/main/battery-node-console-worker.test.ts` — same pattern
- `tests/tty/main/battery-node-tty.test.ts` — 3 makeSuite→runSuite calls, 3 imports replaced
- `tests/tty/main/battery-node-tty-worker.test.ts` — same pattern
- `tests/browser/main/battery-browser.test.ts` — 6 makeSuite→runSuite calls, 6 imports replaced

## Files deleted

- `tests/common/levels.suite.ts` ✓
- `tests/common/formats.suite.ts` ✓
- `tests/common/mixins.suite.ts` ✓
- `tests/common/options.suite.ts` ✓
- `tests/common/prefix.suite.ts` ✓
- `tests/common/scopes.suite.ts` ✓
- `tests/common/spinners.suite.ts` ✓

## Files NOT deleted (deferred)

- `tests/common/parity.suite.ts` — still imported by parity-console.test.ts and parity-tty.test.ts (D-06). Deferred to Phase 13.

## Self-check

- [x] `grep "makeSuite" tests/node/main/battery-*.test.ts tests/tty/main/battery-*.test.ts tests/browser/main/battery-*.test.ts` → no output
- [x] `ls tests/common/parity.suite.ts` → file exists (kept)
- [x] `ls tests/common/levels.suite.ts` → does not exist (deleted)
- [x] `pnpm exec tsc --noEmit` → exits 0 (TSC OK)
- [x] `pnpm test` → 977 tests passed, 20 files, 0 failures

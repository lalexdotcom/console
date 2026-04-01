---
plan: 16-04-simple-suites
phase: 16
status: complete
commit: a6774d6
---

## Summary

Migrated the three simplest suites (levels, scopes, options) to the split run()/check()
pattern. All TestCases now have a check() method; run() contains only stimulus.

## What was built

- **`tests/common/suites/levels.suite.ts`**: All 11 TestCases migrated — check() asserts entry count and level field; run() contains only the `L.*()` call
- **`tests/common/suites/scopes.suite.ts`**: Structural tests use `check: () => {}` no-op; capture tests assert scope field in check()
- **`tests/common/suites/options.suite.ts`**: Mix of no-op and field-asserting check() depending on whether the test captures output; OPT-03 made TTY-aware (level may be undefined in color mode)

## Key decisions

- OPT-03 level assertion: TTY color-mode renders badge without brackets → ANSI strip may not produce a parseable level field; added fallback `raw.toMatch(/ERROR/i)`
- Structural scopes tests (asserting API return values) keep their assertions in run() since there is nothing to check in entries

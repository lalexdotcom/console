---
plan: 16-05-medium-suites
phase: 16
status: complete
commit: a6774d6
---

## Summary

Migrated the medium-complexity suites (mixins, prefix) to the split run()/check() pattern.

## What was built

- **`tests/common/suites/mixins.suite.ts`**: All limit/override TestCases migrated; check() asserts entry count, level, and msg fields
- **`tests/common/suites/prefix.suite.ts`**: All TestCases migrated; PREFIX-03 caller/scope assertions use a `entries[0].caller ?? JSON.parse(raw).caller` fallback because non-JSON adapters may not populate the caller field directly

## Key decisions

- PREFIX-03 caller fallback: in JSON format the caller is available via parse(); in non-JSON formats the raw line may be a JSON string stored by another adapter path — added graceful fallback to `JSON.parse(raw)` when `entries[0].caller` is undefined
- PREFIX-03 scope fallback: same pattern applied to scope assertions

---
plan: 16-02-node-adapters
phase: 16
status: complete
commit: d998aef
---

## Summary

Implemented `parse()` on the three Node console adapters (json, logfmt, pretty).

## What was built

- **`tests/console/json/adapter.ts`**: `parse()` uses `JSON.parse` + `p.severity` for `LogOutput.level` (not `p.level`). Handles all optional fields. Removed `_typeCheck`, `RootLogger` import, and `logger` getter.
- **`tests/console/logfmt/adapter.ts`**: `parse()` delegates to existing `parseLogfmt()` helper, guards on `p.severity`. Same capture wrapping.
- **`tests/console/pretty/adapter.ts`**: Added `stripAnsi()`, `BADGE_TO_LEVEL` map, and `parsePrettyLine()` at module level. Handles spinner icon brackets (`[ ✔ ]`) and level badges (`[INFO]`, `[INFO <scope>]`). Both adapters assign `parse: parsePrettyLine`.

## State

All three Node console adapters satisfy the new `TestAdapter` contract. Combined with plan 16-01 (foundation) and plan 16-03 (TTY/browser), all 5 adapters are migrated.

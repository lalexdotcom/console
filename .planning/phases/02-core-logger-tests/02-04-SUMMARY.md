---
phase: 02-core-logger-tests
plan: "04"
subsystem: tests/node
tags: [tests, scopes, mixins, rate-limiting, one-shot-options]
dependency_graph:
  requires: ["02-01"]
  provides: ["SCOPE-01", "SCOPE-02", "SCOPE-03", "SCOPE-04", "MIX-01", "MIX-02", "MIX-03", "MIX-04"]
  affects: ["test coverage", "pnpm test:node"]
tech_stack:
  added: []
  patterns:
    - "L.scope('unique-per-test') isolation via reset.ts beforeEach scope cache flush"
    - "loop-at-same-line pattern for stable call-site key derivation in once()/limit() tests"
    - "explicit key parameter in limit(n, key) to group cross-line calls under one counter"
    - "pretty format + date regex for one-shot options assertion"
key_files:
  created:
    - tests/node/main/scopes.test.ts
    - tests/node/main/mixins.test.ts
  modified: []
decisions:
  - "Used JSON format for SCOPE-01/02/04 emit assertions — scope field in JSON payload is the cleanest check"
  - "Used pretty format for SCOPE-03 date cascade tests (time field is always in JSON regardless of date option)"
  - "Used loop-at-same-line pattern for MIX-01/02 — all loop iterations map to same call-site key"
  - "Captured each MIX-03 call in a separate captureAll() to count per-call emissions independently"
  - "Used pretty format + /\\[\\d{4}-\\d{2}-\\d{2}/ regex for MIX-04 one-shot date assertion"
metrics:
  duration: 57s
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_created: 2
---

# Phase 02 Plan 04: Scoped Loggers and Rate-Limiting Mixin Tests Summary

**One-liner:** Scopes (SCOPE-01–04) and mixin (MIX-01–04) test files covering scope creation/caching/cascade/isolation and once/limit/limit-with-key/options one-shot behaviors.

## What Was Built

Two test files delivering coverage for 8 requirements:

**`tests/node/main/scopes.test.ts`** (9 tests):
- SCOPE-01: `L.scope('name')` returns a ScopeLogger with `scope` property, all 11 level methods, and `once`/`limit`/`options` mixin methods; level methods emit JSON output with `scope` in the payload.
- SCOPE-02: `L.scope('same-name')` twice returns the exact same object reference (registry cache); different names return distinct instances.
- SCOPE-03: scope inherits root `date` option when no own override exists (pretty format); scope own `date=false` overrides root `date=true`; scope `date=true` does not leak to root.
- SCOPE-04: `s1.level = 'error'` does not affect `s2.level` (sibling isolation); `s.level = 'warn'` does not affect `L.level` (root isolation).

**`tests/node/main/mixins.test.ts`** (4 tests):
- MIX-01: `s.once().info()` in a 5-iteration loop emits exactly once — all iterations share the same call-site key (same source line) → counter accumulates correctly.
- MIX-02: `s.limit(3).info()` in a 10-iteration loop emits exactly 3 times.
- MIX-03: `s.limit(2, 'shared-counter').info()` called 3 times from 3 different source lines → explicit key bypasses call-site derivation → 2 emits, 1 drop.
- MIX-04: `s.options({date:true}).info()` emits with date bracket; next `s.info()` has no date bracket (no state mutation from one-shot override).

## Key Decisions

1. **JSON format for SCOPE-01/02/04**: The `scope` field in the JSON payload (`parsed.scope`) provides a clean, unambiguous assertion that the scope name is wired through the prefix pipeline.
2. **Pretty format for SCOPE-03 date cascade**: The `time` field is always present in JSON output (falls back to `Date.now()` even when `date=false`). Pretty format date bracket `[YYYY-MM-DD ...]` is the only reliable way to distinguish `date=true` from `date=false`.
3. **Separate `captureAll()` per MIX-03 call**: Wrapping each `s.limit(2, key).info()` in its own `captureAll()` makes it easy to assert independently which calls emit and which are dropped.
4. **`L.pad = false` in pretty format tests**: Removes padding from level labels, simplifying the regex assertions without affecting the date bracket pattern.

## Test Results

All 83 node tests pass:
- `tests/node/main/scopes.test.ts` — 9/9 ✓
- `tests/node/main/mixins.test.ts` — 4/4 ✓
- All pre-existing test files — unaffected ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check

- [x] `tests/node/main/scopes.test.ts` exists
- [x] `tests/node/main/mixins.test.ts` exists
- [x] commit e0d0c4f (scopes.test.ts) exists in git log
- [x] commit a3d46db (mixins.test.ts) exists in git log
- [x] `pnpm test:node` → 83 passed, 0 failed

## Self-Check: PASSED

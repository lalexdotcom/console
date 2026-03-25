---
phase: 260325-jnb
plan: 01
subsystem: types / tests
tags: [typescript, strict-mode, types, tests]
dependency_graph:
  requires: []
  provides: [RootLogger.bypass, RootLogger.restore, type-safe console cast, type-safe WL cast]
  affects: [src/types.ts, tests/helpers/console-spy.ts, tests/node/main/worker-e2e.test.ts, tests/node/main/worker-protocol.test.ts]
tech_stack:
  added: []
  patterns: [double-cast through unknown (as unknown as X)]
key_files:
  created: []
  modified:
    - src/types.ts
    - tests/helpers/console-spy.ts
    - tests/node/main/worker-e2e.test.ts
    - tests/node/main/worker-protocol.test.ts
decisions:
  - Declared bypass(console: Console)/restore() on RootLogger — no import needed, Console is in DOM lib
  - Used double-cast (as unknown as X) as the strict-mode escape hatch for intentional dynamic indexing
metrics:
  duration: <5min
  completed: "2026-03-25"
---

# Quick Task 260325-jnb: Fix TypeScript Type Errors in Tests

**One-liner:** Closed 16 tsc errors by declaring `bypass()`/`restore()` on `RootLogger` and applying `as unknown as X` double-cast where dynamic index access is intentional.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add `bypass()` and `restore()` to `RootLogger` | aab317b | `src/types.ts` |
| 2 | Fix unsafe direct casts via double-cast through `unknown` | aab317b | `tests/helpers/console-spy.ts`, `tests/node/main/worker-e2e.test.ts`, `tests/node/main/worker-protocol.test.ts` |

## Verification

- `npx tsc --noEmit` → **0 errors, exit 0**
- `pnpm test:node` → **171 tests passed**

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/types.ts` — RootLogger interface contains `bypass` and `restore` ✓
- `tests/helpers/console-spy.ts` — both casts use `as unknown as Record<string, unknown>` ✓
- `tests/node/main/worker-e2e.test.ts` — cast uses `as unknown as Record<string, unknown>` ✓
- `tests/node/main/worker-protocol.test.ts` — cast uses `as unknown as Record<string, (...args: unknown[]) => void>` ✓
- Commit aab317b exists ✓

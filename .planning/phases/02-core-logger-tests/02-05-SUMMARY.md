---
phase: 02-core-logger-tests
plan: 05
subsystem: tests/node/main
tags: [tests, registry, console, bypass, patch, singleton]
dependency_graph:
  requires: ["02-01"]
  provides: [REG-01, REG-02, REG-03, REG-04, CONS-01, CONS-02, CONS-03, CONS-04]
  affects: []
tech_stack:
  added: []
  patterns:
    - "makeStreamSpy() helper — real Console backed by a Writable for bypass tests"
    - "L.exclusive = true/false (boolean API) — not the object-assign pattern from plan"
key_files:
  created:
    - tests/node/main/registry.test.ts
    - tests/node/main/console.test.ts
  modified:
    - src/logger/index.ts
decisions:
  - "Used L.exclusive = true/false (boolean setter) instead of L.exclusive = L and delete L.exclusive — the plan's non-boolean assignment is truthy-coerced at runtime, but delete L.exclusive removes the accessor without clearing registry.exclusive, so the lock is never released; the boolean setter is the correct API"
  - "Used real Console(Writable) spy for bypass tests — plain spy objects fail because callOnActiveConsole calls method.apply(spy) where Node console methods are bound to the global console, ignoring the this argument"
  - "Fixed emitConsole: replaced method.apply(activeConsole, args) with callOnActiveConsole() — Node console methods are bound, so .apply() cannot redirect this; callOnActiveConsole dispatches directly via the captured method when no bypass is active, and routes by method name on activeConsole when bypassed, preventing both the binding and the infinite loop with L.patch()"
  - "console.error → L.crit (not L.error): L.patch() wires console.error to L.crit; severity in bypass/console.error tests is 'crit'"
metrics:
  duration: "475s"
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 05: Registry and Console Integration Tests — Summary

**One-liner:** Singleton registry coverage (REG-01–04) + console patch/bypass tests (CONS-01–04) with a `callOnActiveConsole` bug fix that makes bypass() actually redirect output in Node json/logfmt mode.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create tests/node/main/registry.test.ts | d519507 | 1 created |
| 2 | Fix emitConsole bound-method bug (Rule 1) | 4deaaf9 | src/logger/index.ts |
| 2 | Create tests/node/main/console.test.ts | 4fac71e | 1 created |

## Verification

```
pnpm test:node
  ✓ tests/node/main/smoke.test.ts       (1)
  ✓ tests/node/main/registry.test.ts   (13)
  ✓ tests/node/main/scopes.test.ts     (9)
  ✓ tests/node/main/console.test.ts    (9)
  ✓ tests/node/main/levels.test.ts     (18)
  ✓ tests/node/main/prefix.test.ts     (20)
  ✓ tests/node/main/formats.test.ts    (14)
  ✓ tests/node/main/mixins.test.ts     (4)
  ✓ tests/node/main/options.test.ts    (17)

  Test Files 9 passed
       Tests 105 passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] L.exclusive = L / delete L.exclusive → boolean setter API**
- **Found during:** Task 1 (registry.test.ts implementation)
- **Issue:** `L.exclusive = L` assigns a RootLogger object to a boolean setter — it works at runtime (truthy coercion sets `registry.exclusive = self`), but `delete L.exclusive` deletes the accessor property from the object without clearing `registry.exclusive`. The exclusive lock is never actually released; the test expecting `other.info()` to emit after `delete L.exclusive` would fail.
- **Fix:** `L.exclusive = true` to acquire the lock; `L.exclusive = false` to release it (the setter handles `b ? self : undefined` correctly).
- **Files modified:** tests/node/main/registry.test.ts
- **Commit:** d519507

**2. [Rule 1 - Bug] Plain spy object fails for bypass tests — Console methods are bound**
- **Found during:** Task 2 (console.test.ts first run returns stdout=1, spy.lines=0)
- **Issue:** Node console methods (`console.info`, `console.warn`, etc.) are bound to the global console instance at creation. `Function.prototype.apply()` cannot override the `this` of a bound function, so `method.apply(spy, args)` always writes to the original `process.stdout`/`process.stderr`. The plan's plain-object spy `{ info: fn }` would not receive calls, and the `method.apply(spy, ...)` call against a plain (non-Console) object in the original library code was moot.
- **Fix:** Use `makeStreamSpy()` which creates a real `Console(ws, ws)` instance. Additionally fixed `emitConsole` in the library (see deviation 3).
- **Files modified:** tests/node/main/console.test.ts
- **Commit:** 4fac71e

**3. [Rule 1 - Bug] emitConsole: method.apply(activeConsole) doesn't redirect (bound); also creates infinite loop when patched**
- **Found during:** Task 2 test run — heap OOM on the patch() test triggered by infinite recursion
- **Issue:** Two bugs in `emitConsole`:
  1. `method.apply(activeConsole, [line])` — console methods are bound, so this never redirects to the bypass spy
  2. After `callOnActiveConsole` was changed to look up by method name: `activeConsole['info']` after `L.patch()` resolves to `L.info` → emit → callOnActiveConsole → L.info → … (infinite loop, OOM)
- **Fix:** `callOnActiveConsole(method, args)` dispatches via the captured method directly when `activeConsole === systemConsole` (avoiding patch loops), and routes by method name on `activeConsole` when bypassed to a different console (correctly redirecting output).
- **Files modified:** src/logger/index.ts
- **Commit:** 4deaaf9

**4. [Rule 1 - Bug] console.error → L.crit: plan asserted severity='error'**
- **Found during:** Task 2 implementation (reading patch() source)
- **Issue:** `L.patch()` maps `console.error → self.crit.bind(self)`, not `self.error`. The plan's test asserted `expect(parsed.severity).toBe('error')` which would fail (actual severity is 'crit').
- **Fix:** Changed assertion to `expect(parsed.severity).toBe('crit')` and updated test description.
- **Files modified:** tests/node/main/console.test.ts
- **Commit:** 4fac71e

## Known Stubs

None.

## Self-Check

```bash
[ -f "tests/node/main/registry.test.ts" ] && echo "FOUND" || echo "MISSING"
[ -f "tests/node/main/console.test.ts" ] && echo "FOUND" || echo "MISSING"
```

## Self-Check: PASSED

- tests/node/main/registry.test.ts: FOUND ✓
- tests/node/main/console.test.ts: FOUND ✓
- Commits d519507, 4deaaf9, 4fac71e: present in git log ✓
- pnpm test:node: 105 tests passing ✓

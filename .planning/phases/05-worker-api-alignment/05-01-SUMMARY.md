---
phase: 05-worker-api-alignment
plan: 01
subsystem: worker
tags: [worker, api, rslib, typescript]

requires: []
provides:
  - "src/worker/const.ts: single source of truth for WORKER_FILENAME"
  - "rslib.config.ts: imports constant, no source.define block on lib[1]"
  - "src/worker/index.ts: import.meta.url path resolution, releaseWorker(), L/Logger exports, _terminateTransport bug fixed"
  - "src/env.d.ts: cleaned — no __WORKER_SCRIPT__ declaration"
affects: [05-02]

tech-stack:
  added: []
  patterns:
    - "Single source of truth constant: src/worker/const.ts → imported by both build config and runtime"
    - "Runtime path resolution via import.meta.url.endsWith('.ts') instead of build-time define"

key-files:
  created: [src/worker/const.ts]
  modified: [src/worker/index.ts, rslib.config.ts, src/env.d.ts]

key-decisions:
  - "import.meta.url extension check (.ts vs .js) replaces __WORKER_SCRIPT__ build-time define injection"
  - "releaseWorker() is the new public API (terminateWorker removed as breaking change)"
  - "L and Logger are the new export aliases (WL and WorkerLogger removed)"

patterns-established:
  - "WORKER_FILENAME constant imported in both rslib.config.ts (build) and src/worker/index.ts (runtime)"

requirements-completed: [ALIGN-01, ALIGN-02, ALIGN-03, ALIGN-04, ALIGN-05, ALIGN-06, ALIGN-07, WORKER-01, WORKER-02, WORKER-03, WORKER-04]

duration: 5min
completed: 2026-03-25
---

# Phase 05 Plan 01 Summary

**Worker API aligned: const.ts created, releaseWorker() introduced, _terminateTransport bug fixed, L/Logger exported.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T17:08:43Z
- **Completed:** 2026-03-25T17:14:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created `src/worker/const.ts` as single source of truth for the worker script filename — no more string duplication between build config and runtime
- Removed brittle `source.define` / `__WORKER_SCRIPT__` mechanism; replaced with `import.meta.url.endsWith('.ts')` extension detection that works transparently in rstest, tsx, and production builds
- Fixed `_terminateTransport` assignment bug: was never assigned inside `transportPromise.then()`, so `releaseWorker()` could not kill the fork
- Renamed `terminateWorker` → `releaseWorker` and `WL/WorkerLogger` → `L/Logger` to match main API surface

## Task Commits

1. **Task 1 + 2: All changes** — `e152e26` (feat(worker): align /worker API)

## Files Created/Modified
- `src/worker/const.ts` — Exports `WORKER_FILENAME = 'worker'` (new)
- `rslib.config.ts` — Imports constant, lib[1] source.define block removed
- `src/worker/index.ts` — Path resolution, releaseWorker, L/Logger exports, bug fix
- `src/env.d.ts` — `__WORKER_SCRIPT__` declaration removed

## Next Plan Readiness
Plan 05-02 must update test imports: `WL → L`, `WorkerLogger → Logger`, `terminateWorker → releaseWorker`.
TypeScript currently reports 4 errors (test files only) — expected, Plan 05-02 closes them.

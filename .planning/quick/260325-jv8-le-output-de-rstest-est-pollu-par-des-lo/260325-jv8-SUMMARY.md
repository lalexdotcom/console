---
phase: quick-260325-jv8
plan: 01
subsystem: tests / worker
tags: [spinner, worker, test-hygiene, stdout-capture]
key-files:
  modified:
    - tests/node/main/spinner-node.test.ts
    - src/worker/index.ts
decisions:
  - "Spinner instances must always be created inside captureAll() to prevent initial frame leaking to process.stdout during rstest runs"
  - "Worker fork uses stdio: pipe for fd[2] — worker stderr must not bleed into parent terminal or test reporter output"
metrics:
  duration: ~3min
  completed: "2026-03-25"
  tasks: 2
  files: 2
---

# Quick Task 260325-jv8: rstest output pollution — SUMMARY

**One-liner:** Silenced spinner stdout leaks (4 tests) and worker stderr bleed (ERR_UNKNOWN_FILE_EXTENSION) for a clean `pnpm test:node` output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wrap 4 spinner creations inside `captureAll()` | `a121721` | `tests/node/main/spinner-node.test.ts` |
| 2 | Pipe worker stderr (fd[2]: 'inherit' → 'pipe') | `b6844f4` | `src/worker/index.ts` |

## What Was Done

### Task 1 — Wrap spinner creations inside captureAll()

Four tests were instantiating spinners **outside** of `captureAll()`, causing the initial `[ ⋯ ]` frame to be written directly to `process.stdout` during rstest runs:

- **spin-01-stop**: `let sp!: LoggerSpinner` + `captureAll(() => { sp = L.scope(...).info.spin(...); })`
- **spin-02-after-stop**: wrapped creation **and** `sp.stop()` in first `captureAll` block
- **spin-02-double-success**: wrapped creation in `captureAll`
- **spin-08-stderr**: wrapped creation in `captureAll`

Pattern applied consistently:
```ts
// Before (leaked to stdout)
const sp = L.scope('...').info.spin('task');

// After (captured)
let sp!: LoggerSpinner;
captureAll(() => { sp = L.scope('...').info.spin('task'); });
```

### Task 2 — Pipe worker stderr

Changed `stdio` option in `createNodeTransport()` (fork call) from:
```ts
stdio: ['inherit', 'inherit', 'inherit', 'ipc']
```
to:
```ts
stdio: ['inherit', 'inherit', 'pipe', 'ipc']
```

This silences `ERR_UNKNOWN_FILE_EXTENSION` errors emitted by the tsx loader in dev mode (when forking a `.ts` worker script). The piped stderr is intentionally not read — workers must not write to stderr in production; errors are already handled by `child.on('error', ...)`.

## Verification

```
Tests 171 passed
Duration 170ms (build 65ms, tests 105ms)
ERR_UNKNOWN_FILE_EXTENSION occurrences: 0
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `tests/node/main/spinner-node.test.ts` ✔ modified and committed (`a121721`)
- `src/worker/index.ts` ✔ modified and committed (`b6844f4`)
- 171/171 tests passing ✔
- Zero TypeScript errors (`tsc --noEmit`) ✔
- Zero `ERR_UNKNOWN_FILE_EXTENSION` in output ✔

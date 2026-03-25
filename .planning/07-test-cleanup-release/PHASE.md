# Phase 07: Test Cleanup & Release Prep

**Milestone:** v3.0.0 Consolidation
**Goal:** Smoke tests deleted, rstest builtins replace custom helpers where possible, `releaseWorker` E2E coverage added, and `package.json` version bumped to `3.0.0-rc.0`.

## Requirements Covered

- **TEST-01**: `tests/node/main/smoke.test.ts` removed — coverage absorbed into targeted tests
- **TEST-02**: `tests/browser/main/smoke.test.ts` removed — coverage absorbed into browser tests
- **TEST-03**: rstest builtins audited — custom helpers replaced where rstest 0.9.x provides an equivalent
- **TEST-04**: Worker mock pattern in `worker-protocol.test.ts` simplified if a cleaner alternative to `__non_webpack_require__` is available in rstest 0.9.x
- **TEST-05**: `releaseWorker()` covered by E2E test (replaces the `terminateWorker` / WORK-09 scope)
- **VERSION-01**: `package.json` version set to `3.0.0-rc.0` at end of milestone

## Success Criteria

1. `tests/node/main/smoke.test.ts` and `tests/browser/main/smoke.test.ts` no longer exist on disk
2. `pnpm test` passes with all remaining tests green (test count does not decrease — former smoke coverage is absorbed by targeted tests)
3. At least one test in `worker-e2e.test.ts` asserts `releaseWorker()` kills the fork and activates the fallback logger
4. Each remaining custom test helper either has a documented reason for keeping it or is replaced by an rstest 0.9.x builtin
5. `package.json` `version` field is exactly `3.0.0-rc.0`
6. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### Smoke test removal

The two smoke tests (`tests/node/main/smoke.test.ts`, `tests/browser/main/smoke.test.ts`) assert only that the runtime environment is what rstest expects (`typeof process === 'object'`, `typeof document === 'object'`). These are environment sanity checks, not feature tests. Their removal is safe because:

- Node environment validity is implicitly proven by every other Node test suite running.
- Browser environment validity is implicitly proven by every other browser test suite running.

No coverage gap is introduced. Simply delete both files.

### rstest builtins audit scope

Compare each file in `tests/helpers/` against rstest 0.9.x APIs:

| Helper | What it does | rstest equivalent? |
|--------|--------------|--------------------|
| `capture.ts` | Wraps `captureAll()` for stdout/stderr interception | No direct equivalent — keep |
| `console-spy.ts` | Spies on browser console methods | `vi.spyOn` covers this — evaluate replacement |
| `logfmt.ts` | Parses `key=value` log lines | No equivalent — keep |
| `reset.ts` | Resets logger singleton state between tests | No equivalent — keep |
| `stdout.ts` | Low-level stdout fd capture | No direct equivalent — keep |

Document audit findings in `tests/helpers/README.md` (one line per helper: keep / replaced / removed + reason).

### TEST-04: `__non_webpack_require__` pattern

`worker-protocol.test.ts` uses `rs.hoisted()` + `__non_webpack_require__` to intercept the `node:child_process` singleton via the CJS module cache. Check rstest 0.9.x changelog and docs for:

- `vi.mock('node:child_process', ...)` — if rstest now supports dynamic import interception for Node built-in protocols
- Any `unstable_mockModule` API that handles `node:` protocol

If a cleaner API exists: replace the `__non_webpack_require__` approach, verify tests still pass, document the change. If not: leave the current pattern in place and add a comment explaining why.

### `releaseWorker` E2E test (TEST-05)

`tests/node/main/worker-e2e.test.ts` currently covers `terminateWorker` (WORK-09). Phase 05 renamed this to `releaseWorker`. Update the test:

- Import `releaseWorker` from `@lalex/console/worker`
- Assert child process is killed after `releaseWorker()` (e.g. listen for `'exit'` event on the child before calling, or check `child.killed`)
- Assert subsequent log calls on `L`/`Logger` reach the fallback (main-process logger), not the fork
- Assert `releaseWorker()` is idempotent (calling twice does not throw)

### VERSION-01: version bump

Only change: set `"version": "3.0.0-rc.0"` in `package.json`. No git tag. No `npm publish`. The `upversion` script handles those separately and is explicitly out of scope.

Bump as the very last action in the phase, after all tests are green and `tsc --noEmit` passes.

# P03 Summary — console/pretty and tty Directories

**Phase:** 13-directory-restructure
**Plan:** P03
**Wave:** 2
**Status:** Completed

## What Was Built

### Task 1: `tests/console/pretty/`

`adapter.ts`:
- `mainAdapter` (`node-console:pretty`): sets `L.format = 'pretty'`
- `workerAdapter` (`node-console-worker:pretty`): `releaseWorker()` then `WL.format = 'pretty'`

`index.test.ts`:
- 7 shared suites via `runSuite` with `workerAdapter` parity
- Mirrors `console/json/` and `console/logfmt/` structure exactly

### Task 2: `tests/tty/`

`adapter.ts`:
- `ttyAdapter` (`node-tty:pretty`): main adapter, `L.format = 'pretty'`
- `ttyWorkerAdapter` (`node-tty-worker:pretty`): `releaseWorker()` then `WL.format = 'pretty'`
- Both import `captureAsync` from `../common/capture.helper`
- TTY routing active via `resolve.alias` substituting `tests/tty/env.ts`

`index.test.ts`:
- 3 suites only: `levelsSuite`, `optionsSuite`, `mixinsSuite`
- Excluded: formats (no raw json/logfmt), scopes/prefix (JSON.parse throws on ANSI), spinners (console-mode timing)
- `afterEach(() => releaseWorker())` cleanup

`tests/tty/env.ts` NOT modified ✓

## Verification

- `tests/console/pretty/index.test.ts` runs 7 suites ✓
- `tests/tty/index.test.ts` runs 3 suites ✓
- `ttyAdapter` and `ttyWorkerAdapter` exported ✓
- `tests/tty/env.ts` still exists ✓

## Commit

`f41fe93` — feat(tests): P13-P03 — console/pretty directory and tty adapters

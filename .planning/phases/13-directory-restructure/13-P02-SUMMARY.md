# P02 Summary — console/json and console/logfmt Directories

**Phase:** 13-directory-restructure
**Plan:** P02
**Wave:** 2
**Status:** Completed

## What Was Built

### Task 1: `tests/console/json/`

`adapter.ts`:
- `mainAdapter` (`node-console:json`): sets `L.format = 'json'`, captures via `captureAsync`
- `workerAdapter` (`node-console-worker:json`): calls `releaseWorker()` then `WL.format = 'json'`
- Both import `captureAsync` from `../../common/capture.helper`
- TypeScript type-level check: `WL as RootLogger`

`index.test.ts`:
- 7 shared suites via `runSuite(suite, mainAdapter, workerAdapter)` with built-in parity
- `afterEach(() => releaseWorker())` belt-and-suspenders cleanup

### Task 2: `tests/console/logfmt/`

Structurally identical to `json/` with format substitutions:
- `mainAdapter.name`: `'node-console:logfmt'`, `L.format = 'logfmt'`
- `workerAdapter.name`: `'node-console-worker:logfmt'`, `WL.format = 'logfmt'`

## Verification

- Both `index.test.ts` run 7 suites with `workerAdapter` parity
- Adapter names confirmed: json ✓, logfmt ✓
- `captureAsync` import from `../../common/capture.helper` ✓

## Commit

`dc0709c` — feat(tests): P13-P02 — console/json and console/logfmt directories

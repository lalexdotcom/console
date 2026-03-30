# P04 Summary — Cleanup + rstest.config.ts Update

**Phase:** 13-directory-restructure
**Plan:** P04
**Wave:** 3
**Status:** Completed

## What Was Built

### Task 1: Delete D-01 — 7 standalone node tests

Removed files superseded by shared suite batteries in `tests/console/{json,logfmt,pretty}/`:
- `tests/node/main/formats.test.ts`
- `tests/node/main/levels.test.ts`
- `tests/node/main/mixins.test.ts`
- `tests/node/main/options.test.ts`
- `tests/node/main/prefix.test.ts`
- `tests/node/main/scopes.test.ts`
- `tests/node/main/spinner-node.test.ts`

Preserved: `console.test.ts`, `registry.test.ts`, `worker-e2e.test.ts`, `worker-protocol.test.ts`

### Task 2: Delete D-02 (3 parity files) + D-05 (5 old battery files)

D-02 — parity now integrated into `runSuite()` built-in mechanism:
- `tests/common/parity.suite.ts`
- `tests/node/main/parity-console.test.ts`
- `tests/tty/main/parity-tty.test.ts`

D-05 — batteries replaced by per-format `index.test.ts`:
- `tests/node/main/battery-node-console.test.ts`
- `tests/node/main/battery-node-console-worker.test.ts`
- `tests/tty/main/battery-node-tty.test.ts`
- `tests/tty/main/battery-node-tty-worker.test.ts`
- `tests/browser/main/battery-browser.test.ts`

### Task 3: Update rstest.config.ts + fix runner parity isolation

`rstest.config.ts`: Added `'tests/console/**/*.test.ts'` as first entry in `node-console`
project include array.

**Bug fix discovered during validation:** `runner.ts` parity runs shared the same `test()`
body without a registry reset between `tc.run(mainAdapter)` and `tc.run(workerAdapter)`.
State mutations from the main run (e.g. `L.level = 'info'`, `once()`/`limit()` counters)
bled into the parity run, causing failures in `options` and `mixins` suites.

**Fix applied:**
- `reset.helper.ts`: extracted `resetRegistry()` as an exported function
- `runner.ts`: calls `resetRegistry()` + `workerAdapter.setup()` + `suite.setup?.()` before
  the parity run to ensure each run starts from the same clean state

## Final Test Results

```
pnpm test: 520 passed, 0 failed
  [node-console] ✓ (includes 3×7 suites × 2 adapters + preserved node tests)
  [node-tty]     ✓ (3 suites × 2 adapters + spinner-tty.test.ts)
  [browser]      ✓ (6 suites × 1 adapter + browser.test.ts)
```

## Commits

- `e3e04d4` — chore(tests): P13-P04/1 — delete D-01 standalone node tests (7 files)
- `574a99c` — chore(tests): P13-P04/2 — delete D-02 parity files and D-05 old battery files
- `b4e48f6` — fix(tests): P13-P04/3 — update rstest.config.ts node-console include + fix parity runner

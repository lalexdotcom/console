---
plan: 03-03
phase: 03-browser-tty-spinner-tests
status: complete
commit: fb6c569
tests_added: 19
tests_passing: 20/20 (browser project)
---

## What was built

Created `tests/browser/main/browser.test.ts` with three describe blocks covering
CORE-07, CORE-08, and SPIN-09 requirements.

## Key decisions

### D-POLYFILL: pluginNodePolyfill added to rstest browser project

**Problem**: `src/logger/index.ts` imports `ttyRenderer` (line 13) which imports
`stripVTControlCharacters` from `node:util`. Rspack cannot bundle `node:*` URIs
for browser targets without polyfills.

**Fix**: Modified `rstest.config.ts` — added `pluginNodePolyfill()` via
`withRslibConfig({ modifyLibConfig })` for the browser project only. The
`@rsbuild/plugin-node-polyfill` package was already a dev dependency (same
plugin used in `rsbuild.config.ts` for the dev playground).

**Impact**: Node tests unaffected; only the browser Rspack compilation receives
the polyfill.

### D-DEBUG-SPY: debug level routes to console.log when console.debug is spied

**Problem**: `LEVEL_METHODS` captures console method references at module load
time. In `emitConsole`:
```typescript
const effectiveMethod =
  !isNode && method !== activeConsole.debug ? activeConsole.log : method;
```
When `rs.spyOn(console, 'debug').mockImplementation(...)` replaces
`console.debug` with a spy, the identity check `method !== activeConsole.debug`
becomes `originalDebug !== spy` = `true` → routes to `console.log`.

**Fix**: The debug-level test in CORE-07 asserts on `logSpy.mock.calls` (not
`debugSpy`). The %c format string assertion remains valid — the routing is a
test-environment artefact, not a production regression. Added a code comment
explaining the artefact.

**Production behaviour**: Without a spy replacing `console.debug`, the identity
check holds (`method === activeConsole.debug`) and debug levels correctly call
`console.debug`, appearing only in Verbose filter.

### D-FAKE-TIMERS-INLINE (carried over from 03-01)

rstest v0.9.4 `beforeAll/afterAll` hook teardown bug — `rs.useFakeTimers()` is
called inline per test in SPIN-09, not in hooks. See 03-01-SUMMARY.md.

### D-FORMAT-NOT-NEEDED (browser path bypass)

`L.format = 'pretty'` is NOT needed in browser tests. The browser path in
`emitConsole` uses `renderBrowserPrefix` regardless of `registry.format` — the
JSON/logfmt serialisation branch is only taken when `isNode && format ===
'json'/'logfmt'`.

## Test structure

```
CORE-07 (6 tests): info, debug, notice + test.each(['success','notice','info'])
CORE-08 (9 tests): error/warn/groupCollapsed+%c/non-TRACE + test.each(TRACE_LEVELS)
SPIN-09 (4 tests): start, tick, success, progress:true
```

## Self-Check

- [x] `pnpm test:browser` → 20/20 pass (smoke + browser.test.ts)
- [x] `pnpm test:node` → 125/125 pass (no regression)
- [x] No `captureAll` in browser.test.ts (D-07 strict)
- [x] No `spyOnConsole` import
- [x] smoke.test.ts untouched (D-06)
- [x] `rs.spyOn` used throughout

---
plan: "08-05"
status: complete
commit: f458a44
tests_added: 394
tests_total: 583
---

## What was implemented

- **`tests/node/main/battery-node-console.test.ts`** — Node battery with three format adapters (json / logfmt / pretty). Implements `captureAsync()` that patches `process.stdout.write` + `process.stderr.write`, awaits the callback, and restores. Instantiates 7 suites × 3 adapters = 21 suite groups.
- **`tests/browser/main/battery-browser.test.ts`** — Browser battery with a single `browserAdapter` using `rs.spyOn` on `console.log/warn/error/debug/groupCollapsed`. Instantiates 6 suites × 1 adapter = 6 suite groups (formats suite excluded — browser output is always `%c` CSS, not JSON/logfmt).

## Fixes applied to shared suites

| File | Fix |
|------|-----|
| `levels.suite.ts` | Added `L.format = 'json'` in outer `beforeEach` — prevents TRACE_LEVELS pretty-mode stack trace spillover (emerg/alert/crit/error/warn emitting 6 lines instead of 1) |
| `prefix.suite.ts` | Browser guards on PREFIX-01 (badge brackets), PREFIX-02 logfmt, all of PREFIX-03 (JSON parsing), and all of PREFIX-04 (JSON + bracket format) — browser always emits `%cLABEL%c` CSS strings |
| `scopes.suite.ts` | Browser guard on SCOPE-01 JSON-parsing assertion (browser output is `%c` CSS, not JSON) |
| `spinners.suite.ts` | `RUNNING_ICON` constant (`-` for browser, `⋯` for node); guards on SPIN-01 `update` text check, SPIN-05 duration suffix check, and SPIN-08 bracket-format tests (node console renderer only) |

## Browser capture design notes

- TRACE_LEVELS in browser emit two console calls: `groupCollapsed(formattedMessage)` + `log(stackTraceString)`. The capture filters lines matching `/^\s+at /` so each TRACE_LEVEL counts as exactly one captured line.
- Browser spinner text (`callArgs[0]`) is passed as a separate positional arg to `console.log`, beyond the `%c` format string in `c[0]`. Tests that verify text content (SPIN-01 `update`, SPIN-05 duration) are guarded for browser.

## UAT verification

All `must_haves.truths` from the plan confirmed:
- ✅ battery-node-console.test.ts: 7 suites × 3 format variants = 21 suite groups
- ✅ battery-browser.test.ts: 6 suites (formats excluded) × 1 browser adapter = 6 suite groups
- ✅ Async-safe capture: patches stdout+stderr, awaits fn(), restores
- ✅ Browser uses rs.spyOn (no page object)
- ✅ `pnpm test` → 583 tests, 0 failures

---
status: complete
phase: 02-core-logger-tests
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md]
started: 2026-03-24T17:00:00.000Z
updated: 2026-03-24T17:10:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Full Test Suite Passes
expected: Running `pnpm test:node` exits 0. The output shows 9 test files all passing and 105 tests passing in total (smoke: 1, levels: 18, formats: 14, prefix: 20, options: 17, scopes: 9, mixins: 4, registry: 13, console: 9). No failures, no skipped tests.
result: pass

### 2. captureAll() — Captures Both Streams
expected: The `captureAll()` helper (tests/helpers/capture.ts) intercepts both `process.stdout.write` and `process.stderr.write` simultaneously during the callback execution, returning `{ stdout: string[], stderr: string[] }`. After the callback returns (or throws), both streams are restored to their original write functions — no leakage between tests.
result: pass

### 3. parseLogfmt() — Parses Logfmt Lines
expected: The `parseLogfmt()` helper (tests/helpers/logfmt.ts) correctly parses a logfmt line like `level=info msg="hello world" time="2026-03-24T12:00:00Z"` into `{ level: 'info', msg: 'hello world', time: '2026-03-24T12:00:00Z' }`. Quoted values are unquoted correctly (using JSON.parse as the inverse of JSON.stringify). Unquoted values pass through as-is.
result: pass

### 4. Level Stream Routing
expected: When an `L.format = 'json'` logger writes messages, the stream routing is deterministic: `emerg`, `alert`, `crit`, `error`, and `warn` all go to **stderr** (captured by `captureAll().stderr`), while `info`, `notice`, `debug`, `verbose`, `trace`, and `silly` all go to **stdout** (captured by `captureAll().stdout`). All 11 level methods dispatch to the correct stream.
result: pass

### 5. Threshold Filtering and Enabled Toggle
expected: Setting `L.level = 'warn'` suppresses all messages with a lower priority level (info, debug, verbose, trace, silly) — they produce no output. Messages at `warn` or higher still emit. Setting `L.enabled = false` suppresses all output entirely regardless of level — nothing is written to either stream. Re-enabling with `L.enabled = true` restores normal emission.
result: pass

### 6. JSON / Logfmt / Pretty Format Field Contracts
expected: With `L.format = 'json'`, each log line is valid JSON containing `level` (the channel name, e.g. `"info"`), `severity` (the LogLevel string, e.g. `"info"`), `time` (ISO timestamp), and `msg`. With `L.format = 'logfmt'`, each line uses `key=value` pairs in the correct field order and no ANSI codes. With `L.format = 'pretty'`, each line shows a bracket label like `[INFO]`, `[ERROR]`, etc. without any ANSI escape sequences when ANSI is disabled.
result: pass

### 7. Scope Isolation and Option Cascade
expected: `L.scope('a')` and `L.scope('b')` return distinct ScopeLogger objects. Calling `L.scope('a')` twice returns the **same reference** (registry cache). Setting `scopeA.level = 'error'` does not affect `scopeB.level` or `L.level` (sibling and root isolation). A scope without its own `date` option inherits the root `date` option, but setting a scope-own `date` value does not leak back to the root.
result: pass

### 8. Rate-Limiting Mixins: once() and limit()
expected: Calling `scope.once().info('msg')` inside a loop 5 times emits exactly **1** message (all iterations map to the same call-site key). Calling `scope.limit(3).info(...)` in a 10-iteration loop emits exactly **3** messages. Using `scope.limit(2, 'explicit-key').info(...)` from 3 different call sites still counts all 3 calls under the same key, emitting 2 times and dropping the third. `scope.options({date: true}).info(...)` emits with a date bracket, but the next bare `scope.info(...)` has no date bracket (no state mutation).
result: pass

### 9. Console Patch and Bypass
expected: After `L.patch()`, calling `console.info('test')` routes the output through the logger system and appears in the captured logger output. `console.error` is mapped to `L.crit` (severity = `'crit'`). After `L.bypass(spy)` with a real `Console(writable)` spy, all logger output is redirected to `spy` instead of `process.stdout`/`process.stderr`. After `L.bypass()` (no arg) output returns to the normal streams.
result: pass

## Summary

total: 9
passed: 9
issues: 0
skipped: 0
pending: 0

## Gaps

[none yet]

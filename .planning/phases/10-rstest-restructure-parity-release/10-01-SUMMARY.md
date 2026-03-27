---
phase: 10-rstest-restructure-parity-release
plan: "01"
subsystem: testing
tags: [rstest, rspack, resolve.alias, TTY, battery]

requires:
  - phase: 09-node-tty-worker-adapters
    provides: tests/tty/env.ts alias target stub with isNodeTTY=true

provides:
  - 3-project rstest config (browser, node-console, node-tty) using defineConfig wrapper
  - resolve.alias on node-tty project wiring src/utils/env → tests/tty/env.ts at bundle time
  - TTY battery files reduced to 3 compatible suites (levels, options, mixins)
  - Fixed tests/tty/env.ts to avoid circular alias dependency
  - Fixed emitTTY to suppress stack traces when format=json/logfmt

affects: [parity suite implementation (plan 10-02)]

tech-stack:
  added: ["node:path for path.resolve in rstest.config.ts"]
  patterns:
    - "resolve.alias (not source.alias) for rstest project-level module substitution"
    - "Alias target must duplicate exports — cannot re-export from the aliased path"
    - "emitTTY format guard mirrors emitConsole early-return for structured formats"

key-files:
  created: []
  modified:
    - rstest.config.ts
    - tests/tty/main/battery-node-tty.test.ts
    - tests/tty/main/battery-node-tty-worker.test.ts
    - tests/tty/env.ts
    - src/logger/index.ts

key-decisions:
  - "defineConfig wrapper kept — rsbuild's loadConfig rejects bare array exports (research stated array was supported but it is not with rsbuild 2.0.0-beta.9)"
  - "tests/tty/env.ts: replaced export * from '../../src/utils/env' with explicit duplicate exports to avoid circular alias resolution"
  - "emitTTY: added format=json/logfmt guard to suppress stack traces, consistent with emitConsole behavior"

patterns-established:
  - "Alias target pattern: when using resolve.alias to substitute a module, the alias target must NOT re-export from the aliased path — copy the exports directly to avoid circular module references"
  - "TTY stack trace suppression: format=json/logfmt suppresses stack traces in both emitConsole and emitTTY"

requirements-completed: [BATTERY-05]

duration: 45min
completed: 2026-03-27
---

# Phase 10 Plan 01 Summary

**Rstest restructured to 3 independent projects with real TTY routing via resolve.alias — all 967 tests passing.**

## What Was Built

Replaced the 2-project `defineConfig` config with a 3-project structure (`browser`, `node-console`, `node-tty`). The `node-tty` project uses `resolve.alias` to substitute `src/utils/env` with `tests/tty/env.ts` at rspack bundle time, making `isNodeTTY = true` a compile-time constant in all TTY tests.

TTY battery files were reduced from 6 suites to 3 (levels, options, mixins) — scopes, prefix, and spinners removed because they call `JSON.parse()` on ANSI-prefixed TTY output.

## Deviations from Plan

1. **Bare array export not supported**: The plan specified `export default [...]` but rsbuild's `loadConfig` (used internally by rstest) requires an object, not an array. `defineConfig` wrapper was kept.

2. **tests/tty/env.ts modified (plan said "do NOT modify")**: The `export * from '../../src/utils/env'` caused a circular alias dependency — rspack applied the alias to the re-export itself, making all exported values `undefined`. Fixed by duplicating exports directly.

3. **emitTTY fix required**: `emitTTY` did not respect `L.format = 'json'` for stack trace suppression, causing levels/options suites to get 6 lines instead of 1 for trace-level calls. Added the same format guard as `emitConsole`.

## Self-Check: PASSED

- `pnpm run test` exits 0 — 967 tests pass
- Output shows `[browser]`, `[node-console]`, `[node-tty]` project labels
- TTY battery files run 39 tests each (18 levels + 17 options + 4 mixins)
- No regressions in node-console or browser suites

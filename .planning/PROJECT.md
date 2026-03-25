# @lalex/console

## What This Is

A zero-dependency, environment-adaptive structured logger for Node.js and browsers. It provides a singleton logger with syslog-severity levels (emerg→wth), environment-aware rendering (browser devtools, Node TTY with cursor control, Node CI with json/logfmt/pretty), scoped child loggers, spinner animations, rate limiting, and optional worker-thread offloading via IPC or MessageChannel.

## Core Value

Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

## Requirements

### Validated

- ✓ Syslog-severity log levels (emerg, alert, crit, error, warn, notice, success, info, verb, debug, wth) — existing
- ✓ Environment-adaptive output (browser devtools, Node TTY, Node CI/console) — existing
- ✓ Console mode formats: json, logfmt, pretty — existing
- ✓ Scoped child loggers with option inheritance — existing
- ✓ Structured prefix pipeline (level, date, icon, caller, text, progress) — existing
- ✓ Spinner mixin with sequential queue and environment-specific renderers — existing
- ✓ Rate-limiting mixin (once, limit) — existing
- ✓ One-shot option override mixin — existing
- ✓ Worker proxy via IPC (Node fork) and MessageChannel (Web Worker) — existing
- ✓ Singleton registry on globalThis with cross-module dedup — existing
- ✓ Stack trace display for emerg/alert/crit levels (TRACE_LEVELS) — existing
- ✓ Zero runtime dependencies — existing
- ✓ rstest testing framework configured — validated in Phase 1
- ✓ Exhaustive test suite: console mode (stdout capture, json/logfmt/pretty) — validated in Phase 2
- ✓ Add error and warn to TRACE_LEVELS for browser stack trace display — validated in Phase 1
- ✓ Exhaustive test suite: browser mode (rstest browser mode + Playwright) — validated in Phase 3
- ✓ Exhaustive test suite: TTY mode (console spinner + TTY renderer) — validated in Phase 3
- ✓ Worker proxy protocol tests (WORK-01..08) — validated in Phase 4
- ✓ Worker proxy E2E + API surface parity (WORK-09, API-01) — validated in Phase 4

### Active

- [ ] API-02: README and JSDoc updated to document unified API with only import path difference
- [ ] terminateWorker() process termination bug: `_terminateTransport` is never assigned, fork is not killed (known, deferred)

### Out of Scope

- npm publishing workflow — already planned separately
- Git tag creation / version bumps — handled by existing `upversion` script
- Major API refactoring — only light adjustments

## Context

- **Brownfield project**: Fully functional library — exhaustive test suite now shipped (v1.0)
- **171 tests passing** across 15 test files: node/main (13 files), tty/main (1 file), browser/main (1 file)
- **Stack trace adjustment shipped**: `error` and `warn` added to `TRACE_LEVELS` in `src/levels.ts`
- **Known bug**: `_terminateTransport` in `src/worker/index.ts` is never assigned — `terminateWorker()` does NOT kill the forked child process. Only fallback activation happens. Deferred to v1.1.
- **Build toolchain**: Rslib (ESM + DTS), Rsbuild (browser playground), Biome (lint/format), rstest v0.9.4
- **Key testing insight**: rspack `importDynamic: false` means `import('node:child_process')` bypasses the webpack module registry; mock interception requires `__non_webpack_require__` in `rs.hoisted()` to mutate the Node CJS singleton directly

## Constraints

- **Zero dependencies**: Library must remain dependency-free at runtime
- **No version changes**: Never modify version in package.json or create git tags
- **TypeScript strict mode**: No `any`, named exports only, interface over type for object shapes
- **Language**: All code, comments, and documentation in English

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| rstest as test framework | Part of the Rspack ecosystem (Rslib/Rsbuild), native TypeScript support | Validated in Phase 1 |
| Console mode tests via stdout capture | captureAll() intercepts process.stdout/stderr; parseLogfmt() is the exact inverse of JSON.stringify serialization | Validated in Phase 2 |
| Dynamic timestamps replaced with placeholder | Stable CI snapshots require deterministic output; timestamps replaced before toMatchInlineSnapshot() | Validated in Phase 2 |
| Hybrid TTY testing | Pure CI automation isn't feasible for animated TTY output; call ttyRenderer directly, bypassing selectSpinnerFactory() | Validated in Phase 3 |
| Browser tests via rstest browser mode | Native console capture, real headless Chromium environment | Validated in Phase 3 |
| `__non_webpack_require__` in `rs.hoisted()` for fork mock | `importDynamic: false` in rspack config means `import('node:child_process')` bypasses the module registry; only CJS singleton mutation via `__non_webpack_require__` intercepts it | Validated in Phase 4 |
| Worker stderr piped (not inherited) | Prevents `ERR_UNKNOWN_FILE_EXTENSION` from child process polluting test output; correct production behavior too | Validated in Phase 4 (quick task) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-25 after v1.0 milestone — 4 phases, 171 tests passing*

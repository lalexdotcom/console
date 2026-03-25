# @lalex/console

## What This Is

A zero-dependency, environment-adaptive structured logger for Node.js and browsers. It provides a singleton logger with syslog-severity levels (emerg→wth), environment-aware rendering (browser devtools, Node TTY with cursor control, Node CI with json/logfmt/pretty), scoped child loggers, spinner animations, rate limiting, and optional worker-thread offloading via IPC or MessageChannel.

## Core Value

Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

## Current Milestone: v3.0.0 Consolidation

**Goal:** Align the `/worker` API exactly on the main package API (same import, different path), fix the `releaseWorker` regression, simplify the worker script path resolution, ensure browser-consumer compatibility, clean up tests, and deliver a clean `3.0.0-rc.0` package.

**Target features:**
- `@lalex/console/worker` exports `L`, `Logger`, and `releaseWorker` — identical API surface to `@lalex/console`, only the import path differs
- `releaseWorker()`: destroys the fork/Worker and transitions `L`/`Logger` to main-process mode (fallback) — restores a function that existed in a prior version
- Worker script path: single TypeScript constant in `src/worker/const.ts`, imported by both `rslib.config.ts` and the runtime source — no `source.define` injection, no tsx fallback hack
- Browser-consumer compatibility: packages can import `@lalex/console` in browser-only bundlers without Node module import errors
- Test cleanup: smoke tests removed, custom helpers replaced by rstest native equivalents where available
- `package.json` version bumped to `3.0.0-rc.0`

**Breaking changes:** `WL`, `WorkerLogger`, and `terminateWorker` removed from `/worker` exports → semver major.

---

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

- [ ] ALIGN-01: `/worker` exports `L` (same RootLogger singleton type as main `L`)
- [ ] ALIGN-02: `/worker` exports `Logger` (same constructor type as main `Logger`)
- [ ] ALIGN-03: `terminateWorker` renamed to `releaseWorker` in `/worker` exports — same behaviour, new name
- [ ] ALIGN-04: `/worker` exports `releaseWorker()` under the new name; old `terminateWorker` export removed (breaking)
- [ ] ALIGN-05: `WL` and `WorkerLogger` removed from `/worker` public exports (breaking)
- [ ] WORKER-01: Worker script filename defined once in `src/worker/const.ts`, imported by both rslib.config.ts and src/worker/index.ts
- [ ] WORKER-02: Runtime path resolution supports built (`.js`) and tsx (`.ts`) modes via `import.meta.url` extension detection
- [ ] BROWSER-01: Package buildable by browser-only consumers without `node:*` import errors
- [ ] BROWSER-02: `exports` map in `package.json` exposes `"browser"` condition for the `/worker` entry
- [ ] BUILD-01: `dist/` structure matches all `exports` entries in `package.json` (types + runtime)
- [ ] BUILD-02: Tree-shaking verified — browser consumers do not pull in Node-only code paths
- [ ] TEST-01: Smoke tests removed (node + browser), coverage absorbed into meaningful tests
- [ ] TEST-02: Custom test helpers audited against rstest builtins — replaced where rstest provides equivalent
- [ ] TEST-03: Worker mock pattern simplified if rstest 0.9.x provides a cleaner alternative to `__non_webpack_require__`
- [ ] TEST-04: `releaseWorker()` test coverage (replaces terminateWorker / WORK-09 scope)
- [ ] VERSION-01: `package.json` version set to `3.0.0-rc.0` at end of milestone

### Out of Scope

- npm publishing workflow — handled by dedicated tooling
- Git tag creation / version bumps — handled by `upversion` script; **never git-tag manually**
- Full internal rename of WL/WorkerLogger internals (only public exports change)

## Context

- **Brownfield project**: Fully functional library — exhaustive test suite shipped (v1.0), now entering Consolidation (v3.0.0)
- **171 tests passing** across 15 test files: node/main (13 files), tty/main (1 file), browser/main (1 file)
- **Stack trace adjustment shipped**: `error` and `warn` added to `TRACE_LEVELS` in `src/levels.ts`
- **Known bug (active)**: `_terminateTransport` in `src/worker/index.ts` is never assigned — `terminateWorker()` (soon `releaseWorker()`) does NOT kill the forked child process. The rename to `releaseWorker` and the kill fix are both in scope for v3.0.0.
- **Worker path hack**: `__WORKER_SCRIPT__` define in rslib.config.ts lib[1] is never propagated to rstest by `withRslibConfig()` — the tsx fallback (`'./worker.ts'`) silently causes `ERR_UNKNOWN_FILE_EXTENSION`, bypassed by piping stderr. To be replaced by the shared-constant approach.
- **Browser compat issue**: A browser-only consumer reported bundling errors due to `node:*` static imports leaking through `/worker` entry — requires `"browser"` exports condition pointing to a safe build.
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

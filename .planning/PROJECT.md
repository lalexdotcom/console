# @lalex/console

## What This Is

A zero-dependency, environment-adaptive structured logger for Node.js and browsers. It provides a singleton logger with syslog-severity levels (emerg→wth), environment-aware rendering (browser devtools, Node TTY with cursor control, Node CI with json/logfmt/pretty), scoped child loggers, spinner animations, rate limiting, and optional worker-thread offloading via IPC or MessageChannel.

## Core Value

Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

## Current Milestone: v3.0.1 Shared Test Battery

**Goal:** Introduire un `TestAdapter` commun et des suites partagées exécutables sur les 3 environnements (node-console, node-tty, browser) via une abstraction adéquate, restructurer `rstest.config.ts` en 3 projets indépendants, et livrer une suite de parité main ↔ worker.

**Target features:**
- `TestAdapter` interface (`tests/common/adapter.ts`) avec `setup()`, `capture()`, `logger` — abstraction commune pour tous les environnements
- Suites partagées `tests/common/*.suite.ts` exportant `makeSuite(adapter)` — mêmes assertions behaviorales pour tous les adaptateurs
- Adaptateurs pour `node-console` (json/logfmt/pretty), `node-tty`, `browser-main`, + variantes worker
- `rstest.config.ts` splité en 3 projets indépendants : `browser`, `node-console`, `node-tty`
- `source.alias` TTY : redirect `src/utils/env` → `tests/tty/env.ts` (exports `isNodeTTY = true`) — sans modifier `src/`
- Suite de parité main ↔ worker : output byte-identical pour chaque cas partagé (timestamps supprimés)
- `package.json` version bumpé à `3.0.1-rc.0`

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

- [ ] BATTERY-01: `TestAdapter` interface in `tests/common/adapter.ts` — `setup()`, `capture()`, `logger` property
- [ ] BATTERY-02: Shared suites in `tests/common/*.suite.ts` — levels, formats, scopes, options, prefix, mixins, spinners; each exports `makeSuite(adapter)`
- [ ] BATTERY-03: Adapters for `node-console` (json / logfmt / pretty) and `browser-main`
- [ ] BATTERY-04: Worker adapters for `node-console-worker` and `node-tty-worker`; parity verified against main adapters
- [ ] BATTERY-05: `rstest.config.ts` restructured into 3 independent projects: `browser`, `node-console`, `node-tty`
- [ ] BATTERY-06: `tests/tty/env.ts` exports `isNodeTTY = true`; `node-tty` project uses `source.alias` to redirect `src/utils/env` → `tests/tty/env.ts`; no env-var in `src/`
- [ ] BATTERY-07: Parity suite (`tests/common/parity.suite.ts`) asserts main ↔ worker output identical (timestamps stripped) for every shared case
- [ ] VERSION-02: `package.json` version set to `3.0.1-rc.0` at end of milestone

### Out of Scope

- npm publishing workflow — handled by dedicated tooling
- Git tag creation / version bumps — handled by `upversion` script; **never git-tag manually**
- Full internal rename of WL/WorkerLogger internals (only public exports change)

## Context

- **Brownfield project**: Fully functional library — exhaustive test suite + v3.0.0 Consolidation shipped, now entering v3.0.1 Shared Test Battery
- **189 tests passing** across 13 test files: node/main (11 files), tty/main (1 file), browser/main (1 file)
- **v3.0.0 Consolidation shipped**: Worker API aligned (L/Logger/releaseWorker), browser compat (node: imports removed, browser lib entry), smoke tests removed, package at `3.0.0-rc.0`
- **Build toolchain**: Rslib (ESM + DTS), Rsbuild (browser playground), Biome (lint/format), rstest v0.9.4
- **rstest config**: Currently 2 projects (node + browser) in `rstest.config.ts` — v3.0.1 will split into 3 (node-console, node-tty, browser)
- **Key testing insight**: rspack `importDynamic: false` means `import('node:child_process')` bypasses the webpack module registry; mock interception requires `__non_webpack_require__` in `rs.hoisted()` to mutate the Node CJS singleton directly
- **TTY testing pattern**: Pure CI automation isn't feasible for animated TTY output; call ttyRenderer directly, bypassing `selectSpinnerFactory()`

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
*Last updated: 2026-03-25 after v3.0.0 Consolidation milestone — 7 phases, 189 tests passing, package at 3.0.0-rc.0*

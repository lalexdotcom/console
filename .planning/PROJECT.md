# @lalex/console

## What This Is

A zero-dependency, environment-adaptive structured logger for Node.js and browsers. It provides a singleton logger with syslog-severity levels (emerg→wth), environment-aware rendering (browser devtools, Node TTY with cursor control, Node CI with json/logfmt/pretty), scoped child loggers, spinner animations, rate limiting, and optional worker-thread offloading via IPC or MessageChannel.

## Core Value

Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

## Current Milestone: v3.0.2 Test Architecture Refactor

**Goal:** Refondre l'architecture des tests pour améliorer la lisibilité, supprimer la duplication et rendre la parité main↔worker systématique via un runner générique et des suites déclaratives.

**Target features:**
- `Suite` / `TestCase` interface dans `tests/common/suites/suite.ts` — `name`, `parity?`, `run(adapter)`
- Runner générique `tests/common/suites/runner.ts` — `runSuite(suite, mainAdapter, workerAdapter?)` avec `beforeEach` centralisé et parité automatique
- Toutes les suites migrées vers le nouveau format déclaratif : `levels`, `formats`, `mixins`, `options`, `prefix`, `scopes`, `spinners`
- Nouvelle structure de répertoires : `tests/browser/`, `tests/console/{json,logfmt,pretty}/`, `tests/tty/` — chacun avec `adapter.ts` + `index.test.ts`
- `parity.suite.ts` supprimé — la parité est intégrée dans le runner via `parity?: boolean` (default `true`)
- Tests spécifiques non-partagés (worker protocol, registry, spinner-tty, etc.) conservés dans leurs répertoires respectifs
- `package.json` version → `3.0.2-rc.0`

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

- [ ] ARCH-01: `Suite` / `TestCase` interface in `tests/common/suites/suite.ts` — `name: string`, `parity?: boolean`, `run(adapter: TestAdapter)`
- [ ] ARCH-02: Generic runner in `tests/common/suites/runner.ts` — `runSuite(suite, mainAdapter, workerAdapter?)` with centralised `beforeEach` and automatic parity
- [ ] ARCH-03: All shared suites migrated to declarative format — `levels`, `formats`, `mixins`, `options`, `prefix`, `scopes`, `spinners` in `tests/common/suites/`
- [ ] ARCH-04: New directory structure — `tests/browser/`, `tests/console/{json,logfmt,pretty}/`, `tests/tty/` each with `adapter.ts` + `index.test.ts`
- [ ] ARCH-05: `parity.suite.ts` removed — parity integrated into runner via `parity?: boolean` (default `true`)
- [ ] ARCH-06: Non-shared tests preserved in their respective directories (worker protocol, registry, spinner-tty)
- [ ] ARCH-07: `rstest.config.ts` globs updated for new directory structure
- [ ] VERSION-03: `package.json` version set to `3.0.2-rc.0` at end of milestone

### Out of Scope

- npm publishing workflow — handled by dedicated tooling
- Git tag creation / version bumps — handled by `upversion` script; **never git-tag manually**
- Full internal rename of WL/WorkerLogger internals (only public exports change)

## Context

- **Brownfield project**: Fully functional library — exhaustive test suite + v3.0.1 Shared Test Battery shipped, now entering v3.0.2 Test Architecture Refactor
- **977 tests passing** across 3 rstest projects: `browser`, `node-console`, `node-tty`
- **v3.0.1 Shared Test Battery shipped**: `TestAdapter` interface, shared suites (`makeSuite(adapter)` pattern), 3-project rstest config, parity suite, package at `3.0.1-rc.0`
- **Build toolchain**: Rslib (ESM + DTS), Rsbuild (browser playground), Biome (lint/format), rstest v0.9.4
- **Current test structure**: `tests/common/*.suite.ts` (makeSuite pattern), `tests/node/main/battery-*.test.ts`, `tests/tty/main/battery-*.test.ts`, `tests/browser/main/battery-*.test.ts`
- **Key testing insight**: rspack `importDynamic: false` means `import('node:child_process')` bypasses the webpack module registry; mock interception requires `__non_webpack_require__` in `rs.hoisted()` to mutate the Node CJS singleton directly
- **TTY testing pattern**: Pure CI automation isn't feasible for animated TTY output; call ttyRenderer directly, bypassing `selectSpinnerFactory()`
- **New suite contract (v3.0.2)**: `{ name, description, tests: { name, parity?, run(adapter) }[] }` — `makeSuite(adapter)` pattern replaced by declarative objects + generic `runSuite(suite, main, worker?)` runner

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
*Last updated: 2026-03-27 after v3.0.1 Shared Test Battery milestone — 10 phases, 977 tests passing, package at 3.0.1-rc.0*

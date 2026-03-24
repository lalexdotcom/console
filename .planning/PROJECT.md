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

### Active

- [ ] Add error and warn to TRACE_LEVELS for browser stack trace display
- [ ] Set up rstest testing framework from scratch
- [ ] Exhaustive test suite: browser mode (rstest browser mode + console capture)
- [ ] Exhaustive test suite: console mode (stdout capture, json/logfmt/pretty)
- [ ] Exhaustive test suite: TTY mode (hybrid: CI-testable + local visual validation)

### Out of Scope

- npm publishing workflow — already planned separately
- Git tag creation / version bumps — handled by existing `upversion` script
- Major API refactoring — only light adjustments

## Context

- **Brownfield project**: Fully functional library, needs tests and a minor adjustment
- **Stack trace adjustment**: Adding `error` and `warn` to `TRACE_LEVELS` in `src/levels.ts` — the rest of the codebase already respects this set, so the behavior propagates automatically
- **Testing challenge**: Three distinct runtime modes require different test strategies:
  - Browser: rstest browser mode with console output capture
  - Console (Node CI): stdout capture for json/logfmt/pretty output validation
  - TTY (Node terminal): Hybrid approach — snapshot-based tests runnable in CI + optional visual validation locally
- **Build toolchain**: Rslib (ESM + DTS), Rsbuild (browser playground), Biome (lint/format)
- **No existing tests**: rstest needs to be configured from scratch

## Constraints

- **Zero dependencies**: Library must remain dependency-free at runtime
- **No version changes**: Never modify version in package.json or create git tags
- **TypeScript strict mode**: No `any`, named exports only, interface over type for object shapes
- **Language**: All code, comments, and documentation in English

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| rstest as test framework | Part of the Rspack ecosystem (Rslib/Rsbuild), native TypeScript support | — Pending |
| Hybrid TTY testing | Pure CI automation isn't feasible for animated TTY output; combine ANSI snapshots with local visual checks | — Pending |
| Browser tests via rstest browser mode | Native console capture, real browser environment | — Pending |

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
*Last updated: 2026-03-24 after initialization*

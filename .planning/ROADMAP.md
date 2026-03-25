# Roadmap: @lalex/console

## Overview

This roadmap delivers an exhaustive test suite for the @lalex/console structured logger, plus a minor code adjustment (extending TRACE_LEVELS). The work progresses from test infrastructure through core pipeline validation, environment-specific rendering tests, and finally worker proxy tests — following the dependency graph where each phase builds on patterns and infrastructure established in prior phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Test Infrastructure & Code Adjustment** - Configure rstest, build shared helpers, fix TRACE_LEVELS (completed 2026-03-24)
- [x] **Phase 2: Core Logger Tests** - Validate the core logging pipeline via Node console mode (completed 2026-03-24)
- [x] **Phase 3: Browser, TTY & Spinner Tests** - Validate environment-specific rendering and spinner lifecycle (completed 2026-03-25)
- [x] **Phase 4: Worker Proxy & API Alignment** - Validate worker communication and API surface parity (completed 2026-03-25)

## Phase Details

### Phase 1: Test Infrastructure & Code Adjustment
**Goal**: Test framework is operational, shared utilities are available, and TRACE_LEVELS includes error/warn
**Depends on**: Nothing (first phase)
**Requirements**: ADJ-01, INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):
  1. `pnpm test` runs rstest and exits cleanly (even with zero feature tests)
  2. Browser test project runs in Playwright and a smoke test passes
  3. Logger singleton state is fully isolated between tests (no cross-test leaks)
  4. `error` and `warn` levels produce call-site traces in browser mode
**Plans:** 1/1 plans complete

Plans:
- [x] 01-01-PLAN.md — Install rstest, configure dual projects (node+browser), create test helpers (stdout capture, console spy, registry reset), add smoke tests, fix TRACE_LEVELS

### Phase 2: Core Logger Tests
**Goal**: Core logging pipeline is fully validated through Node console capture — levels, formats, prefix, options, scopes, mixins, registry, and console patching all behave correctly
**Depends on**: Phase 1
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, PREFIX-01, PREFIX-02, PREFIX-03, PREFIX-04, OPT-01, OPT-02, OPT-03, OPT-04, SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, MIX-01, MIX-02, MIX-03, MIX-04, REG-01, REG-02, REG-03, REG-04, CONS-01, CONS-02, CONS-03, CONS-04
**Success Criteria** (what must be TRUE):
  1. Every log level method dispatches to the correct console method and respects the severity filter
  2. JSON, logfmt, and pretty output formats produce valid, parseable output with correct fields
  3. Prefix pipeline renders level badge, date, caller, and scope in the correct structure
  4. Scoped loggers inherit from root, cache by name, and mutate independently
  5. Rate limiting (once/limit), one-shot option override, console patch/unpatch, and singleton registry all behave as documented
**Plans:** 5/5 plans complete

Plans:
- [x] 02-01-PLAN.md — Create shared test helpers: captureAll() (stdout+stderr) and parseLogfmt()
- [x] 02-02-PLAN.md — Write levels.test.ts (CORE-01, 02, 03) + formats.test.ts (CORE-04, 05, 06)
- [x] 02-03-PLAN.md — Write prefix.test.ts (PREFIX-01–04) + options.test.ts (OPT-01–04)
- [x] 02-04-PLAN.md — Write scopes.test.ts (SCOPE-01–04) + mixins.test.ts (MIX-01–04)
- [x] 02-05-PLAN.md — Write registry.test.ts (REG-01–04) + console.test.ts (CONS-01–04)

### Phase 3: Browser, TTY & Spinner Tests
**Goal**: Environment-specific rendering is validated — browser devtools output with CSS styling, spinner lifecycle across all three renderers, and TTY cursor management
**Depends on**: Phase 2
**Requirements**: CORE-07, CORE-08, SPIN-01, SPIN-02, SPIN-03, SPIN-04, SPIN-05, SPIN-06, SPIN-07, SPIN-08, SPIN-09
**Success Criteria** (what must be TRUE):
  1. Browser output uses %c CSS format strings, correct console methods, and groupCollapsed for TRACE_LEVELS
  2. Spinner lifecycle (start → update → success/fail/stop) works correctly with autoStart, exec(), duration, and progress
  3. TTY renderer manages cursor control, multi-spinner layout, and log queue
  4. Console and browser renderers emit environment-appropriate output (ANSI badges for console, CSS badges for browser)
**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — Create spinner-node.test.ts: console spinner lifecycle, terminal state, autoStart, exec, duration, progress, ANSI badges (SPIN-01..06, SPIN-08)
- [x] 03-02-PLAN.md — Create spinner-tty.test.ts: TTY cursor management, tick output, log queue, multi-spinner (SPIN-07)
- [x] 03-03-PLAN.md — Create browser.test.ts: %c CSS format strings, groupCollapsed for TRACE_LEVELS, browser spinner badges (CORE-07, CORE-08, SPIN-09)

### Phase 4: Worker Proxy & API Alignment
**Goal**: Worker proxy communication is validated and the worker API surface matches the main API
**Depends on**: Phase 2
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, API-01, API-02
**Success Criteria** (what must be TRUE):
  1. Worker proxy sends log and spinner messages over IPC and the worker emits correctly
  2. All WorkerMessage types (log, spin:*, opt:set/format/exclusive) are handled; unserializable args fall back gracefully
  3. Messages queued before transport is ready flush on connect; terminateWorker() kills worker and activates fallback
  4. Worker API surface (import from /worker) matches the main API surface
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Create worker-protocol.test.ts: mock node:child_process, test all WorkerMessage types and proxy serialisation (WORK-01..08)
- [x] 04-02-PLAN.md — Create worker-e2e.test.ts: terminateWorker() fallback + idempotence (WORK-09), WL API surface parity (API-01)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Infrastructure & Code Adjustment | 0/0 | Complete    | 2026-03-24 |
| 2. Core Logger Tests | 4/5 | In Progress|  |
| 3. Browser, TTY & Spinner Tests | 0/0 | Not started | - |
| 4. Worker Proxy & API Alignment | 0/0 | Not started | - |

---
*Created: 2026-03-24*
*Last updated: 2026-03-24*

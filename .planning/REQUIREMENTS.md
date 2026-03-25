# Requirements: @lalex/console

**Defined:** 2026-03-24
**Core Value:** Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Code Adjustment

- [ ] **ADJ-01**: error and warn levels produce a call-site trace in browser mode (add to TRACE_LEVELS)

### Test Infrastructure

- [ ] **INFRA-01**: rstest configured with TypeScript ESM support via @rstest/adapter-rslib
- [ ] **INFRA-02**: Shared test helpers for stdout capture (Node console mode)
- [ ] **INFRA-03**: Shared test helpers for console spy capture (browser mode)
- [ ] **INFRA-04**: Singleton registry reset utility for test isolation between tests
- [ ] **INFRA-05**: rstest browser mode configured with Playwright for browser tests
- [ ] **INFRA-06**: Test scripts added to package.json (test, test:browser, test:node)

### Core Logging Tests

- [x] **CORE-01**: All 11 level methods (emerg→wth) dispatch to the correct console method
- [x] **CORE-02**: Level filtering suppresses levels below the configured threshold
- [x] **CORE-03**: Logger.enabled toggle suppresses all output when false
- [x] **CORE-04**: JSON format produces valid, parseable JSON with correct fields (time, level, severity, msg, data)
- [x] **CORE-05**: logfmt format produces valid key=value pairs with correct field ordering
- [x] **CORE-06**: pretty format renders ANSI-prefixed human-readable lines with correct prefix structure
- [ ] **CORE-07**: Browser output uses %c CSS format strings and correct console methods
- [ ] **CORE-08**: TRACE_LEVELS (emerg, alert, crit, error, warn) use console.groupCollapsed in browser mode

### Prefix Pipeline Tests

- [x] **PREFIX-01**: Level badge displays correct label text and ANSI color per level
- [x] **PREFIX-02**: Date prefix produces ISO 8601 timestamp when Logger.date = true
- [x] **PREFIX-03**: Caller prefix shows file:line:col when Logger.stack = true
- [x] **PREFIX-04**: Scope name appears in prefix for scoped loggers

### Options & Configuration Tests

- [x] **OPT-01**: All option getters/setters (enabled, level, pad, color, date, stack, uid, inspect) read/write correctly
- [x] **OPT-02**: Option cascade applies priority: own options > root options > defaults
- [x] **OPT-03**: Level cascading picks the strictest (lowest numeric) between scope and root
- [x] **OPT-04**: util.inspect integration forwards inspect options correctly in Node mode

### Scoped Logger Tests

- [x] **SCOPE-01**: Logger.scope('name') returns a ScopeLogger with all level methods and scope property
- [x] **SCOPE-02**: Same scope name returns cached instance (identity equality)
- [x] **SCOPE-03**: Scope options inherit from root and can be overridden independently
- [x] **SCOPE-04**: Scope mutations do not leak to other scopes or root

### Mixin Tests

- [x] **MIX-01**: Logger.once() emits exactly once per call-site regardless of repeat calls
- [x] **MIX-02**: Logger.limit(n) emits exactly n times per call-site
- [x] **MIX-03**: Logger.limit() with explicit key groups disparate call-sites under one counter
- [x] **MIX-04**: Logger.options({...}).level() applies overrides to one call only, then reverts

### Singleton & Registry Tests

- [x] **REG-01**: Logger is the same instance across multiple imports
- [x] **REG-02**: globalThis registry survives across module loads
- [x] **REG-03**: Logger.exclusive = true silences all other loggers; release restores them
- [x] **REG-04**: Logger.format getter/setter reads/writes registry.format and changes output

### Console Integration Tests

- [x] **CONS-01**: patch() replaces native console methods (log, info, debug, warn, error) with logger methods
- [x] **CONS-02**: unpatch() restores original console methods
- [x] **CONS-03**: bypass(console) redirects output to custom console object
- [x] **CONS-04**: restore() reverts bypass to system console

### Spinner Tests

- [ ] **SPIN-01**: Spinner lifecycle: start → update → success/fail/stop transitions work correctly
- [ ] **SPIN-02**: Stopped spinner is terminal — success/fail after stop is idempotent
- [ ] **SPIN-03**: autoStart: true starts immediately, false requires explicit .start()
- [ ] **SPIN-04**: exec() wraps a promise — resolved → success, rejected → fail + re-throw
- [ ] **SPIN-05**: duration: true shows elapsed time in success/fail message
- [ ] **SPIN-06**: progress: true enables progress updates via .update() with ratio and {done, total}
- [ ] **SPIN-07**: TTY renderer manages cursor, multi-spinner layout, and log queue
- [ ] **SPIN-08**: Console renderer (non-TTY) emits ANSI icon badges without cursor control
- [ ] **SPIN-09**: Browser renderer uses CSS-styled badges and progress bars for devtools

### Worker Proxy Tests

- [ ] **WORK-01**: Worker proxy log dispatch sends WorkerMessage and worker emits correctly
- [ ] **WORK-02**: All WorkerMessage types handled: log, spin:*, opt:set, opt:format, opt:exclusive
- [ ] **WORK-03**: Unserializable args fall back to String() then '[unserializable]'
- [ ] **WORK-04**: Messages before transport ready are queued and flushed on connect
- [ ] **WORK-05**: Worker proxy scoped loggers send scope info in WorkerMessage
- [ ] **WORK-06**: Worker proxy option sync mirrors to proxy state + sends opt:set message
- [ ] **WORK-07**: Worker proxy rate-limiting (once/limit) sends key/max over IPC
- [ ] **WORK-08**: Worker proxy spinner lifecycle (spin:start/update/success/fail) messages work over IPC
- [ ] **WORK-09**: terminateWorker() kills worker, activates fallback logger, is idempotent

### Worker API Alignment

- [ ] **API-01**: import {L} from '@lalex/console/worker' exposes the same public API surface as import {L} from '@lalex/console'
- [ ] **API-02**: README and JSDoc updated to document unified API with only import path difference

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Cross-Environment

- **ENV-01**: Environment detection tests (isNode, isBrowser, isNodeTTY, isMainBrowser, isWebWorker)
- **ENV-02**: UID tracking tests (uid: true prepends {_uid: #N})
- **ENV-03**: Color toggle tests (color: false suppresses ANSI)
- **ENV-04**: Pad toggle tests (pad: true pads labels to uniform width)

### Coverage

- **COV-01**: Istanbul coverage thresholds configured and enforced
- **COV-02**: CI script integration for test runs

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Exact ANSI escape code assertions | Brittle; depends on terminal capabilities; snapshot for regression instead |
| Exact spinner frame character assertions | Implementation detail; frame set may change |
| Timer precision assertions | setTimeout is not precise; CI machines vary |
| TTY cursor position arithmetic | Couples to terminal size; breaks on layout changes |
| Private/internal function unit tests | Over-mocking; test through public API instead |
| Full E2E worker process tests in CI | Slow, flaky; test protocol + message handling separately |
| npm publishing workflow | Already planned separately |
| Git tags / version bumps | Handled by existing upversion script |
| Major API refactoring | Only light adjustments (TRACE_LEVELS + worker API alignment) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADJ-01 | Phase 1 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| CORE-01 | Phase 2 | Complete |
| CORE-02 | Phase 2 | Complete |
| CORE-03 | Phase 2 | Complete |
| CORE-04 | Phase 2 | Complete |
| CORE-05 | Phase 2 | Complete |
| CORE-06 | Phase 2 | Complete |
| CORE-07 | Phase 3 | Pending |
| CORE-08 | Phase 3 | Pending |
| PREFIX-01 | Phase 2 | Complete |
| PREFIX-02 | Phase 2 | Complete |
| PREFIX-03 | Phase 2 | Complete |
| PREFIX-04 | Phase 2 | Complete |
| OPT-01 | Phase 2 | Complete |
| OPT-02 | Phase 2 | Complete |
| OPT-03 | Phase 2 | Complete |
| OPT-04 | Phase 2 | Complete |
| SCOPE-01 | Phase 2 | Complete |
| SCOPE-02 | Phase 2 | Complete |
| SCOPE-03 | Phase 2 | Complete |
| SCOPE-04 | Phase 2 | Complete |
| MIX-01 | Phase 2 | Complete |
| MIX-02 | Phase 2 | Complete |
| MIX-03 | Phase 2 | Complete |
| MIX-04 | Phase 2 | Complete |
| REG-01 | Phase 2 | Complete |
| REG-02 | Phase 2 | Complete |
| REG-03 | Phase 2 | Complete |
| REG-04 | Phase 2 | Complete |
| CONS-01 | Phase 2 | Complete |
| CONS-02 | Phase 2 | Complete |
| CONS-03 | Phase 2 | Complete |
| CONS-04 | Phase 2 | Complete |
| SPIN-01 | Phase 3 | Pending |
| SPIN-02 | Phase 3 | Pending |
| SPIN-03 | Phase 3 | Pending |
| SPIN-04 | Phase 3 | Pending |
| SPIN-05 | Phase 3 | Pending |
| SPIN-06 | Phase 3 | Pending |
| SPIN-07 | Phase 3 | Pending |
| SPIN-08 | Phase 3 | Pending |
| SPIN-09 | Phase 3 | Pending |
| WORK-01 | Phase 4 | Pending |
| WORK-02 | Phase 4 | Pending |
| WORK-03 | Phase 4 | Pending |
| WORK-04 | Phase 4 | Pending |
| WORK-05 | Phase 4 | Pending |
| WORK-06 | Phase 4 | Pending |
| WORK-07 | Phase 4 | Pending |
| WORK-08 | Phase 4 | Pending |
| WORK-09 | Phase 4 | Pending |
| API-01 | Phase 4 | Pending |
| ALIGN-01 | Phase 5 | Pending |
| ALIGN-02 | Phase 5 | Pending |
| ALIGN-03 | Phase 5 | Pending |
| ALIGN-04 | Phase 5 | Pending |
| ALIGN-05 | Phase 5 | Pending |
| ALIGN-06 | Phase 5 | Pending |
| ALIGN-07 | Phase 5 | Pending |
| WORKER-01 | Phase 5 | Pending |
| WORKER-02 | Phase 5 | Pending |
| WORKER-03 | Phase 5 | Pending |
| WORKER-04 | Phase 5 | Pending |
| BROWSER-01 | Phase 6 | Pending |
| BROWSER-02 | Phase 6 | Pending |
| BROWSER-03 | Phase 6 | Pending |
| BUILD-01 | Phase 6 | Pending |
| BUILD-02 | Phase 6 | Pending |
| BUILD-03 | Phase 6 | Pending |
| TEST-01 | Phase 7 | Pending |
| TEST-02 | Phase 7 | Pending |
| VERSION-01 | Phase 7 | Pending |
| API-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 59 total
- Mapped to phases: 59 ✓
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-25 — v3.0.0 requirements appended*

---

## v3.0.0 Requirements

Requirements for the Consolidation milestone. Phases numbered from 05 onwards.

### API Alignment

- [ ] **ALIGN-01**: `@lalex/console/worker` exports `L` as `RootLogger` singleton — identical type to main `L`
- [ ] **ALIGN-02**: `@lalex/console/worker` exports `Logger` as the `RootLogger` constructor type — identical to main `Logger`
- [ ] **ALIGN-03**: `terminateWorker` renamed to `releaseWorker` in `src/worker/index.ts` and in the `/worker` public exports
- [ ] **ALIGN-04**: `WL` removed from `/worker` public exports (breaking)
- [ ] **ALIGN-05**: `WorkerLogger` removed from `/worker` public exports (breaking)
- [ ] **ALIGN-06**: `terminateWorker` removed from `/worker` public exports (breaking)
- [ ] **ALIGN-07**: `releaseWorker()` bug fixed — `_terminateTransport` is correctly assigned so the fork is actually killed

### Worker Path Resolution

- [ ] **WORKER-01**: Worker script filename constant defined once in `src/worker/const.ts` — single source of truth
- [ ] **WORKER-02**: `rslib.config.ts` imports the filename constant from `src/worker/const.ts` — no hardcoded string duplication
- [ ] **WORKER-03**: `src/worker/index.ts` derives the runtime script path from the shared constant with extension switching (`import.meta.url.endsWith('.ts')`) — no `source.define`, no `typeof __WORKER_SCRIPT__` guard
- [ ] **WORKER-04**: `ERR_UNKNOWN_FILE_EXTENSION` no longer occurs in rstest — no tsx fallback needed

### Browser Consumer Compatibility

- [ ] **BROWSER-01**: A browser-only consumer can bundle `@lalex/console` (main entry) without `node:*` import errors
- [ ] **BROWSER-02**: `package.json` `exports` map exposes a `"browser"` condition for the main entry that excludes Node-only code paths
- [ ] **BROWSER-03**: Tree-shaking verified — the browser bundle contains no `node:child_process`, `node:path`, `node:url` references

### Build Validation

- [ ] **BUILD-01**: `dist/` structure matches all `exports` entries in `package.json` (CJS/ESM × runtime + types)
- [ ] **BUILD-02**: DTS output is present and correct for all public entry points
- [ ] **BUILD-03**: `pnpm run build` exits cleanly with no errors or warnings

### Test Cleanup

- [ ] **TEST-01**: `tests/node/main/smoke.test.ts` removed — coverage absorbed into targeted tests
- [ ] **TEST-02**: `tests/browser/main/smoke.test.ts` removed — coverage absorbed into browser tests
- [ ] **TEST-03**: rstest builtins audited — custom helpers replaced where rstest 0.9.x provides an equivalent
- [ ] **TEST-04**: Worker mock pattern in `worker-protocol.test.ts` simplified if a cleaner alternative to `__non_webpack_require__` is available in rstest 0.9.x
- [ ] **TEST-05**: `releaseWorker()` covered by E2E test (replaces the `terminateWorker` / WORK-09 scope)

### Version

- [ ] **VERSION-01**: `package.json` version set to `3.0.0-rc.0` at end of milestone

### Shared Test Battery

- [ ] **BATTERY-01**: `TestAdapter` interface in `tests/common/adapter.ts` — `setup()`, `capture()`, `logger` property
- [ ] **BATTERY-02**: Shared suites in `tests/common/*.suite.ts` — levels, formats, scopes, options, prefix, mixins, spinners; each exports `makeSuite(adapter)`
- [ ] **BATTERY-03**: Adapters for `node-console` (json / logfmt / pretty) and `browser-main`
- [ ] **BATTERY-04**: Worker adapters for `node-console-worker` and `node-tty-worker`; parity verified against main adapters
- [ ] **BATTERY-05**: `rstest.config.ts` restructured into 3 independent projects: `browser`, `node-console`, `node-tty`
- [ ] **BATTERY-06**: `tests/tty/env.ts` exports `isNodeTTY = true`; `node-tty` project uses `source.alias` to redirect `src/utils/env` → `tests/tty/env.ts`; no env-var in `src/`
- [ ] **BATTERY-07**: Parity suite (`tests/common/parity.suite.ts`) asserts main ↔ worker output identical (timestamps stripped) for every shared case

---

## v3.0.0 Requirement → Phase Mapping

| Req | Phase | Status |
|-----|-------|--------|
| ALIGN-01 | Phase 05 | Pending |
| ALIGN-02 | Phase 05 | Pending |
| ALIGN-03 | Phase 05 | Pending |
| ALIGN-04 | Phase 05 | Pending |
| ALIGN-05 | Phase 05 | Pending |
| ALIGN-06 | Phase 05 | Pending |
| ALIGN-07 | Phase 05 | Pending |
| WORKER-01 | Phase 05 | Pending |
| WORKER-02 | Phase 05 | Pending |
| WORKER-03 | Phase 05 | Pending |
| WORKER-04 | Phase 05 | Pending |
| BROWSER-01 | Phase 06 | Pending |
| BROWSER-02 | Phase 06 | Pending |
| BROWSER-03 | Phase 06 | Pending |
| BUILD-01 | Phase 06 | Pending |
| BUILD-02 | Phase 06 | Pending |
| BUILD-03 | Phase 06 | Pending |
| TEST-01 | Phase 07 | Pending |
| TEST-02 | Phase 07 | Pending |
| VERSION-01 | Phase 07 | Pending |

**Coverage (v3.0.0 — 3 phases):**
- Requirements in scope: 20 (ALIGN-01..07, WORKER-01..04, BROWSER-01..03, BUILD-01..03, TEST-01..02, VERSION-01)
- Mapped to phases: 20 ✓
- Deferred (future milestone): TEST-03, TEST-04, TEST-05, BATTERY-01..07

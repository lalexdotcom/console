# Roadmap: @lalex/console

## Milestones

- ✅ **v1.0 Test Suite** — Phases 1–4 (shipped 2026-03-25)
- ✅ **v3.0.0 Consolidation** — Phases 5–7 (shipped 2026-03-25)
- 🚧 **v3.0.1 Shared Test Battery** — Phases 8–10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Test Suite (Phases 1–4) — SHIPPED 2026-03-25</summary>

- [x] **Phase 1: Test Infrastructure & Code Adjustment** — Configure rstest, build shared helpers, fix TRACE_LEVELS (completed 2026-03-24)
- [x] **Phase 2: Core Logger Tests** — Validate the core logging pipeline via Node console mode (completed 2026-03-24)
- [x] **Phase 3: Browser, TTY & Spinner Tests** — Validate environment-specific rendering and spinner lifecycle (completed 2026-03-25)
- [x] **Phase 4: Worker Proxy & API Alignment** — Validate worker communication and API surface parity (completed 2026-03-25)

Full details archived: `.planning/milestones/v1.0-ROADMAP.md`

</details>

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
*Last updated: 2026-03-25*

---

## v3.0.0 Consolidation

- [ ] **Phase 05: Worker API Alignment** — Rename `terminateWorker` → `releaseWorker`, remove `WL`/`WorkerLogger` exports, fix the fork-kill bug, and replace the `__WORKER_SCRIPT__` define with a shared constant in `src/worker/const.ts`
- [ ] **Phase 06: Browser Compatibility & Build Validation** — Add a `"browser"` exports condition to `package.json`, verify tree-shaking eliminates `node:*` references, and validate that `dist/` matches the exports map exactly
- [ ] **Phase 07: Test Cleanup & Release Prep** — Remove smoke tests, audit custom helpers against rstest builtins, and bump `package.json` to `3.0.0-rc.0`

### Phase 05: Worker API Alignment
**Goal**: `@lalex/console/worker` exports `L`, `Logger`, and `releaseWorker` with types identical to the main entry; worker script path sourced from a shared constant in `src/worker/const.ts`; `releaseWorker` bug fixed so the fork is actually killed
**Depends on**: Nothing (first phase of v3.0.0)
**Requirements**: ALIGN-01, ALIGN-02, ALIGN-03, ALIGN-04, ALIGN-05, ALIGN-06, ALIGN-07, WORKER-01, WORKER-02, WORKER-03, WORKER-04
**Success Criteria** (what must be TRUE):
  1. `import { L, Logger, releaseWorker } from '@lalex/console/worker'` compiles without TypeScript errors and the inferred types match their `@lalex/console` counterparts
  2. `WL`, `WorkerLogger`, and `terminateWorker` are absent from the `/worker` public exports — importing any of those names is a compile error
  3. After the fork is ready, `_terminateTransport` is non-null; calling `releaseWorker()` invokes it and the child process is killed (verified via `child.killed === true` or exit event)
  4. `src/worker/const.ts` exports `WORKER_FILENAME`; both `rslib.config.ts` and `src/worker/index.ts` import it — no literal `'worker'` string duplicated in either file
  5. `src/worker/index.ts` resolves the script path using `import.meta.url.endsWith('.ts')` extension switching — the `__WORKER_SCRIPT__` define and the `typeof __WORKER_SCRIPT__` guard are deleted
  6. `tsc --noEmit` passes with zero errors
**Plans:** 2 plans

Plans:
- [ ] 05-01-PLAN.md — Create `src/worker/const.ts`, update `rslib.config.ts` (import + remove define), refactor `src/worker/index.ts` (path fix, bug fix, export rename), clean `src/env.d.ts`
- [ ] 05-02-PLAN.md — Update `worker-e2e.test.ts` and `worker-protocol.test.ts` to new export names; `tsc --noEmit` + full test run
**Plans**: TBD

### Phase 06: Browser Compatibility & Build Validation
**Goal**: Browser-only consumers can bundle `@lalex/console` without `node:*` errors; `package.json` exports map has a `"browser"` condition; `dist/` shape matches every `exports` entry including DTS files
**Depends on**: Phase 05
**Requirements**: BROWSER-01, BROWSER-02, BROWSER-03, BUILD-01, BUILD-02, BUILD-03
**Success Criteria** (what must be TRUE):
  1. A Rsbuild browser-target build that imports `@lalex/console` completes without any unresolved `node:*` module errors
  2. `package.json` `exports` map contains a `"browser"` condition for the main entry pointing to a build artifact that excludes Node-only code paths
  3. `grep -r 'node:child_process\|node:path\|node:url' dist/index.js` returns no matches (those symbols are tree-shaken from the browser output)
  4. Every path declared in the `exports` map has a corresponding file in `dist/`; no extra unreferenced artifacts exist under `dist/`
  5. DTS output is present at every path declared under `"types"` conditions in `exports`
  6. `pnpm run build` exits with code 0 and zero warnings
  7. `tsc --noEmit` passes with zero errors
**Plans:** 2 plans

Plans:
- [ ] 06-01-PLAN.md — Remove top-level node: imports from source (env.ts, renderer.ts), add browser lib entry to rslib.config.ts, add "browser" exports condition to package.json
- [ ] 06-02-PLAN.md — Run pnpm run build, verify dist/ structure matches exports map, verify browser bundle purity, run tsc + full test suite

### Phase 07: Test Cleanup & Release Prep
**Goal**: Smoke tests removed, custom helpers audited against rstest builtins, and `package.json` version bumped to `3.0.0-rc.0`
**Depends on**: Phase 05, Phase 06
**Requirements**: TEST-01, TEST-02, VERSION-01
**Success Criteria** (what must be TRUE):
  1. `tests/node/main/smoke.test.ts` and `tests/browser/main/smoke.test.ts` no longer exist on disk
  2. `pnpm test` passes with all remaining tests green (test count does not decrease — former smoke coverage absorbed by targeted tests)
  3. Each remaining custom test helper either has a documented reason for keeping it or is replaced by an rstest 0.9.x builtin
  4. `package.json` `version` field is exactly `3.0.0-rc.0`
  5. `tsc --noEmit` passes with zero errors
**Plans:** 1 plan

Plans:
- [ ] 07-01-PLAN.md — Delete smoke tests (TEST-01, TEST-02), document helper audit rationale, bump package.json to 3.0.0-rc.0 (VERSION-01)

---

## v3.0.0 Progress

**Execution Order:**
Phases execute in numeric order: 05 → 06 → 07

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|----------|
| 05. Worker API Alignment | 2/2 | Complete | 2026-03-25 |
| 06. Browser Compatibility & Build Validation | 2/2 | Complete | 2026-03-25 |
| 07. Test Cleanup & Release Prep | 1/1 | Complete | 2026-03-25 |

---

## v3.0.1 Shared Test Battery

- [ ] **Phase 08: TestAdapter + Shared Suites + Node-Console Adapter** — Foundation: `TestAdapter` interface, 7 parameterised shared suite files, and node-console + browser-main adapters that make the suites immediately runnable
- [x] **Phase 09: Node-TTY + Worker Adapters** — `tests/tty/env.ts` static TTY override, node-tty adapter, and both worker adapters (node-console-worker, node-tty-worker) (completed 2026-03-26)
- [ ] **Phase 10: rstest Restructure, Parity Suite & Release** — Split `rstest.config.ts` into 3 independent projects (with TTY source alias), add parity suite, bump `package.json` to `3.0.1-rc.0`

### Phase 08: TestAdapter + Shared Suites + Node-Console Adapter
**Goal**: The shared test battery infrastructure exists and is runnable — `TestAdapter` interface defined, all 7 parameterised suite files available, and two concrete adapters (node-console + browser-main) exercise the suites immediately against the existing rstest config
**Depends on**: Phase 07
**Requirements**: BATTERY-01, BATTERY-02, BATTERY-03
**Success Criteria** (what must be TRUE):
  1. `tests/common/adapter.ts` exports a `TestAdapter` interface with `name`, `setup()`, `capture()`, and `logger` properties
  2. Seven suite files (`levels`, `formats`, `scopes`, `options`, `prefix`, `mixins`, `spinners`) exist in `tests/common/`, each exporting `makeSuite(adapter: TestAdapter)`
  3. A `node-console` adapter runs the shared suites for json, logfmt, and pretty formats; all assertions pass
  4. A `browser-main` adapter runs the shared suites against the Playwright browser environment; all assertions pass
  5. `pnpm test` passes with all existing tests still green
  6. `tsc --noEmit` passes with zero errors
**Plans:** 5 plans

Plans:
- [ ] 08-01-PLAN.md — Move `parseLogfmt` to `tests/common/logfmt.helper.ts`, update import in `formats.test.ts`, create `tests/common/adapter.ts` with `TestAdapter` interface (BATTERY-01)
- [ ] 08-02-PLAN.md — Create `tests/common/levels.suite.ts` (CORE-01/02/03) + `tests/common/formats.suite.ts` (CORE-04/05/06) (BATTERY-02)
- [ ] 08-03-PLAN.md — Create `tests/common/scopes.suite.ts`, `options.suite.ts`, `prefix.suite.ts` (SCOPE-01–04, OPT-01–04, PREFIX-01–04) (BATTERY-02)
- [ ] 08-04-PLAN.md — Create `tests/common/mixins.suite.ts` (MIX-01–04) + `tests/common/spinners.suite.ts` (SPIN-01–06/08) (BATTERY-02)
- [ ] 08-05-PLAN.md — Create `tests/node/main/battery-node-console.test.ts` (async capture, 7×3 suites) + `tests/browser/main/battery-browser.test.ts` (rs.spyOn capture, 6 suites) (BATTERY-03)

### Phase 09: Node-TTY + Worker Adapters
**Goal**: All remaining environment adapters are in place — `tests/tty/env.ts` static TTY override created, node-tty adapter instantiates the logger in TTY mode, and both worker adapters (console-worker + tty-worker) connect the shared suites to IPC-backed logger instances
**Depends on**: Phase 08
**Requirements**: BATTERY-04, BATTERY-06
**Success Criteria** (what must be TRUE):
  1. `tests/tty/env.ts` re-exports `src/utils/env` and overrides `isNodeTTY = true` / `isNodeConsole = false`; no modifications to `src/`
  2. A `node-tty` adapter uses this env override to capture TTY-mode output; shared suites run and pass under TTY conditions
  3. A `node-console-worker` adapter correctly wraps the worker proxy, drains IPC output, and tears down via `releaseWorker()`
  4. A `node-tty-worker` adapter mirrors the console-worker but routes through the TTY-configured worker instance
  5. `pnpm test` passes — all prior tests still green, new adapter tests added
  6. `tsc --noEmit` passes with zero errors
**Plans:** 2/2 plans complete

Plans:
- [ ] 09-01-PLAN.md — Create `tests/tty/env.ts` (static TTY override, alias target for Phase 10) + `battery-node-tty.test.ts` (6 suites, console-mode pretty) (BATTERY-06)
- [ ] 09-02-PLAN.md — Create `battery-node-console-worker.test.ts` (7 suites × 3 formats via releaseWorker() fallback) + `battery-node-tty-worker.test.ts` (6 suites, pretty, via fallback) (BATTERY-04)

### Phase 10: rstest Restructure, Parity Suite & Release
**Goal**: `rstest.config.ts` has exactly 3 independent projects; the `node-tty` project applies the TTY source alias; parity suite validates main ↔ worker byte-identical output; `package.json` bumped to `3.0.1-rc.0`
**Depends on**: Phase 09
**Requirements**: BATTERY-05, BATTERY-07, VERSION-02
**Success Criteria** (what must be TRUE):
  1. `rstest.config.ts` defines exactly 3 project objects (`browser`, `node-console`, `node-tty`) — legacy 2-project config fully replaced
  2. The `node-tty` project uses `source.alias` to redirect `src/utils/env` → `tests/tty/env.ts`; no `LLOGER_FORCE_TTY` or equivalent env-var exists in `src/`
  3. Each project's `include` glob targets the correct directory: `tests/browser/**`, `tests/node/**` + `tests/common/**`, `tests/tty/**` + `tests/common/**`
  4. `tests/common/parity.suite.ts` exports `makeParitySuite(mainAdapter, workerAdapter)`; for every shared test case, main and worker outputs are byte-identical after timestamp stripping
  5. `pnpm test` executes all 3 projects and all tests pass (prior count preserved + new parity tests added)
  6. `package.json` `version` is exactly `3.0.1-rc.0`
  7. `tsc --noEmit` passes with zero errors
**Plans**: TBD

---

## v3.0.1 Progress

**Execution Order:**
Phases execute in numeric order: 08 → 09 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|----------|
| 08. TestAdapter + Shared Suites + Node-Console Adapter | 0/0 | Not started | - |
| 09. Node-TTY + Worker Adapters | 0/0 | Complete    | 2026-03-26 |
| 10. rstest Restructure, Parity Suite & Release | 0/0 | Not started | - |

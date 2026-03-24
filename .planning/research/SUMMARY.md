# Project Research Summary

**Project:** @lalex/console
**Domain:** Multi-environment test suite for a TypeScript logger library
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

@lalex/console is a zero-dependency, environment-adaptive structured logger that produces fundamentally different output across three runtime environments: Node CI (json/logfmt/pretty via `console.*`), Node TTY (ANSI-styled via `process.stdout.write` with cursor control and spinners), and browser devtools (CSS `%c`-styled via `console.*` with `groupCollapsed`). Building a test suite for it requires an environment-first architecture — each runtime has its own capture strategy, assertion patterns, and infrastructure requirements. The Rstest ecosystem (`@rstest/core` + `@rstest/adapter-rslib` + `@rstest/browser`) is the clear choice: it reuses the existing Rslib build config directly, supports multi-project separation for the three environments, and provides real-browser testing via Playwright.

The recommended approach is a phased rollout starting with shared test infrastructure (registry reset, capture utilities, config), then progressing through environments in order of increasing complexity: Node console (simplest capture, validates core pipeline), browser (requires Playwright), TTY (requires ANSI snapshots, fake timers, cursor mocking), and finally worker proxy (requires IPC lifecycle management). This mirrors the dependency graph — core logging features must be testable before environment-specific rendering and spinners, and worker tests depend on both Node and browser infrastructure being operational.

The top risks are singleton state leaking between tests (the logger uses `globalThis` registries), console monkey-patching corrupting the test harness (the `patch()` API replaces `console.*` globally), and timer-dependent spinner tests being inherently flaky (the spinner uses `setTimeout` with random jitter). All three are mitigable with upfront infrastructure: a `resetRegistry()` helper, console safety-net wrappers, and a `Math.random` + fake timer double-mock pattern — all built in Phase 1 before any feature test is written.

## Key Findings

### Recommended Stack

The entire test stack stays within the Rspack ecosystem. Rstest's `@rstest/adapter-rslib` eliminates config duplication by reusing `rslib.config.ts` (source.exclude, source.define, tools.rspack) for test builds. Three rstest projects map 1:1 to the three runtime targets.

**Core technologies:**
- **@rstest/core** (^0.9.4): Test runner with Vitest-compatible API — native Rspack integration, no extra transform step
- **@rstest/adapter-rslib** (^0.2.1): `withRslibConfig()` maps Rslib build settings to test config automatically
- **@rstest/browser** (^0.9.4): Real Chromium via Playwright — required for `console.groupCollapsed`, CSS `%c` testing
- **playwright** (^1.49.1): Browser driver for @rstest/browser — only supported provider
- **@rstest/coverage-istanbul** (^0.3.0): Opt-in coverage via `--coverage` flag

**Critical version note:** @rstest/core vendors its own Rsbuild 2.0 beta — does not conflict with the project's @rsbuild/core@^1.7.3.

### Expected Features

See [FEATURES.md](FEATURES.md) for full tables and dependency graph.

**Must have (P1 — core correctness, catches 80% of regressions):**
- Level method dispatch — all 11 levels emit to correct console method
- Level filtering — severity boundary correctness across all 11 levels
- Structured output — JSON valid and complete; logfmt parseable
- Prefix pipeline — level, date, scope, caller produce correct Prefix items
- Option cascading — 4-layer priority chain (defaults → root → scope → per-call)
- Scope creation, caching, inheritance, independence
- Rate limiting — `once()` / `limit()` with counter map
- `patch()` / `unpatch()` — console method replacement/restoration
- Error handling — emit path never throws to user code

**Should have (P2 — environment-specific, requires infrastructure):**
- Browser devtools output — `%c` CSS, `groupCollapsed`, console method mapping
- Spinner lifecycle (all 3 renderers) — state machine, timer-driven animation
- TTY cursor control — multi-spinner, log interleaving
- TRACE_LEVELS stack trace (including planned `error`/`warn` addition)
- Environment detection correctness across runtimes

**Defer (P3 — worker system, high setup cost):**
- Worker proxy message types, buffering, spinner over IPC
- Worker proxy rate limiting, option sync
- `terminateWorker()` lifecycle + fallback
- Cross-module singleton dedup (CJS + ESM dual load)

### Architecture Approach

The test suite uses three rstest projects (`node`, `browser`, `tty`) mapped to an environment-first directory structure under `tests/`. Shared utilities live in `tests/helpers/` (registry-reset, console-capture, stdout-capture, ANSI normalization). Each project has its own setup file that configures environment conditions (env vars, TTY mocking) before module evaluation. See [ARCHITECTURE.md](ARCHITECTURE.md) for full directory tree and data flow diagrams.

**Major components:**
1. **Root rstest config** — 3 projects with Rslib adapter, `onConsoleLog: () => false`, `restoreMocks: true`
2. **Shared helpers** (`tests/helpers/`) — registry reset, console spy capture, stdout write intercept, ANSI strip/normalize
3. **Node project** (`tests/node/`) — `LLOGER_FORCE_CONSOLE=true`, spies on `console.*` and `process.stdout.write`
4. **Browser project** (`tests/browser/`) — separate config file, Playwright + Chromium, spies on `console.*` with CSS arg assertions
5. **TTY project** (`tests/tty/`) — mocked `isTTY`/`columns`, ANSI file snapshots, fake timers for spinners

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 11 pitfalls with full prevention strategies.

1. **GlobalThis singleton leaks** — Delete all three registry keys (`$logger-registry`, `$tty-renderer`, `$worker-logger-registry`) in `beforeEach`. Build `resetRegistry()` helper in Phase 1.
2. **Console monkey-patching corrupts test harness** — Never call `patch()` in tests that also capture console. Test `patch()`/`unpatch()` in isolated files. Save/restore console methods in `afterEach`.
3. **Timer-dependent spinner tests are flaky** — Mock both `Math.random` (fixed jitter) and timers (`rstest.useFakeTimers()`) simultaneously. Test state machine separately from rendering.
4. **Module-level side effects break test isolation** — Environment flags (`isNode`, `isBrowser`, `isNodeTTY`) computed at import time. Use dynamic `import()` after environment setup. Separate environment tests into distinct files.
5. **Worker/IPC tests leave zombie processes** — Mandatory `terminateWorker()` in `afterEach` with timeout. Run worker tests serially.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Test Infrastructure & Configuration
**Rationale:** Every subsequent phase depends on rstest config, shared helpers, and singleton isolation. PITFALLS.md identifies this as the make-or-break phase — registry leaks, console corruption, and module-level side effects must be solved before writing any feature test.
**Delivers:** rstest.config.ts (3 projects), rstest.browser.config.ts, all shared helpers (registry-reset, console-capture, stdout-capture, ANSI utils), setup files for each project, package.json scripts, one smoke test per project.
**Addresses:** Test infrastructure foundation (FEATURES dependency root)
**Avoids:** Pitfall 1 (singleton leaks), Pitfall 2 (console corruption), Pitfall 8 (module-level side effects)

### Phase 2: Node Console Mode Tests (Core Logic)
**Rationale:** Simplest capture strategy (console spy + stdout.write). Validates the entire core logging pipeline — level dispatch, filtering, structured output, prefix, options, scopes, mixins. 80% of regressions are caught here. All higher-complexity phases assume these core features work.
**Delivers:** Level dispatch (all 11), level filtering boundary matrix, JSON/logfmt/pretty format tests, prefix pipeline, option cascading, scope lifecycle, `once()`/`limit()`, `options()` one-shot, `patch()`/`unpatch()`, error handling, exclusive lock.
**Addresses:** All P1 table-stakes features from FEATURES.md
**Avoids:** Pitfall 3 (stdout capture), Pitfall 4 (stack frame offsets), Pitfall 10 (level filtering boundaries), Pitfall 11 (scope cascade)

### Phase 3: Browser Devtools Tests
**Rationale:** Requires Playwright infrastructure but is structurally similar to Node tests. Tests the fundamentally different output format (`%c` CSS, `groupCollapsed`) that can't be validated in jsdom.
**Delivers:** Browser level output, CSS-styled prefix rendering, `groupCollapsed` for TRACE_LEVELS, browser spinner (CSS badges + progress), browser scoped loggers, rate limiting in browser context.
**Addresses:** P2 browser-specific features from FEATURES.md
**Avoids:** Pitfall 7 (browser vs Node capture difference)

### Phase 4: TTY Mode & Spinner Tests
**Rationale:** Most complex environment — requires `isTTY` mocking, ANSI snapshot infrastructure, fake timers, and cursor control sequence assertions. Builds on patterns validated in Phase 2.
**Delivers:** ANSI-colored level output, TTY prefix rendering, spinner lifecycle (start → update → success/fail), sequential timer state machine, TTY renderer cursor management, progress bar, multiple concurrent spinners, log interleaving, `exec()` promise wrapper.
**Addresses:** P2 spinner/TTY features from FEATURES.md
**Avoids:** Pitfall 5 (timer flakiness), Pitfall 9 (ANSI snapshot fragility)

### Phase 5: Worker Proxy Tests
**Rationale:** Depends on both Node and browser infrastructure (IPC via `child_process.fork`, MessageChannel for Web Workers). Highest setup cost, lowest change frequency. Isolated last to avoid zombie processes disrupting earlier phases.
**Delivers:** Worker proxy message dispatch, all WorkerMessage types, structuredClone fallback, message buffering, caller capture over IPC, scoped logger over IPC, rate limiting over IPC, spinner over IPC, `terminateWorker()` + fallback.
**Addresses:** All P3 worker features from FEATURES.md
**Avoids:** Pitfall 6 (zombie processes)

### Phase 6: Coverage & CI Integration
**Rationale:** Once all test suites are in place, enable coverage reporting and ensure CI runs both node and browser test commands.
**Delivers:** Istanbul coverage configuration, CI script integration, coverage thresholds.
**Addresses:** Quality gates and regression detection
**Avoids:** N/A — straightforward configuration

### Phase Ordering Rationale

- **Phase 1 → Phase 2:** Infrastructure must exist before any feature test. Research unanimously confirms this — all 4 files cite singleton isolation and helper utilities as prerequisites.
- **Phase 2 before Phase 3/4:** Core logic tests (levels, filtering, options, scopes) exercise mode-independent code paths. Node console mode is the cheapest to test. Validating the core pipeline first means browser and TTY phases focus solely on rendering differences.
- **Phase 3 before Phase 4:** Browser tests are structurally simpler than TTY (console spy vs stdout intercept + ANSI + timers). Establishing Playwright infrastructure also serves Phase 5's MessageChannel tests.
- **Phase 5 last:** Worker proxy has the highest infrastructure cost (process lifecycle, IPC, message buffering) and the lowest change frequency. It depends on patterns from both Node and browser phases.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (TTY/Spinner):** Complex ANSI snapshot strategy (strip vs semantic parse vs file snapshots) needs concrete decision. Spinner timer mocking interaction with rstest's fake timers needs validation.
- **Phase 5 (Worker):** IPC message serialization testing approach (in-memory mock vs real fork) not fully resolved. MessageChannel availability in rstest browser mode unverified.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Infrastructure):** Well-documented rstest setup. All patterns come directly from rstest docs. HIGH confidence.
- **Phase 2 (Node Console):** Standard spy-based testing patterns. Console capture is thoroughly covered in STACK.md and ARCHITECTURE.md.
- **Phase 3 (Browser):** rstest browser mode has clear docs. Main pattern is console spy with CSS arg assertions — straightforward.
- **Phase 6 (Coverage/CI):** Standard Istanbul setup, documented in rstest coverage docs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm + official docs. Version compatibility confirmed. Rstest ecosystem is purpose-built for this Rspack-based project. |
| Features | HIGH | Feature list derived from direct codebase analysis. Priority matrix grounded in dependency graph and implementation complexity. |
| Architecture | HIGH | 3-project structure maps directly to rstest's documented multi-project feature. Directory layout follows established conventions. |
| Pitfalls | HIGH | Patterns derived from codebase analysis (singleton on globalThis, module-level env detection, setTimeout jitter) + established testing knowledge. |

**Overall confidence:** HIGH

### Gaps to Address

- **rstest `disableConsoleIntercept` interaction:** ARCHITECTURE.md recommends this setting but exact behavior with `onConsoleLog` needs validation during Phase 1 setup.
- **TTY mocking in CI:** The approach of patching `process.stdout.isTTY` in setup files is theoretically sound but untested with rstest's worker isolation. Validate in Phase 1 smoke test.
- **TRACE_LEVELS update:** PROJECT.md lists adding `error` and `warn` to TRACE_LEVELS as an active requirement. Tests in Phase 2 should be written for the expanded set, but the source change must happen first.
- **rstest browser mode + MessageChannel:** Phase 5 browser worker tests assume MessageChannel is available in rstest's Playwright context. This should be verified during Phase 3.
- **@rstest/adapter-rslib `libId`:** Research shows the default (no libId) is sufficient. If worker-specific `source.define.__WORKER_SCRIPT__` is needed in tests, the `libId: 'worker-proxy'` option exists but is untested.

## Sources

### Primary (HIGH confidence)
- [rstest.rs](https://rstest.rs) — Test runner docs: projects, browser mode, snapshots, mocking, coverage, Rslib adapter
- [npm: @rstest/core@0.9.4](https://www.npmjs.com/package/@rstest/core) — Package metadata and dependencies
- Project source code — `src/logger/index.ts`, `src/utils/env.ts`, `src/worker/proxy.ts`, `src/types.ts`, `src/levels.ts`
- `.planning/PROJECT.md` — Project requirements and context
- `.planning/codebase/ARCHITECTURE.md` — Codebase structure analysis

### Secondary (MEDIUM confidence)
- Spinner timer jitter behavior — inferred from `sequential.ts` source code, not from docs
- `disableConsoleIntercept` + `onConsoleLog` interaction — documented separately, combined behavior inferred

### Tertiary (LOW confidence)
- rstest browser mode MessageChannel support — assumed from Playwright capabilities, not explicitly documented
- @rstest/browser stability — marked experimental in rstest docs, though actively maintained

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*

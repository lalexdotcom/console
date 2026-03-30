# Phase 13: Directory Restructure — Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganise the test tree so every shared-suite battery is co-located with its
environment adapter inside a meaningful directory:
- `tests/console/{json,logfmt,pretty}/` — one dir per format, each with its own
  `adapter.ts` + `index.test.ts` running all 7 shared suites with main and worker adapters
- `tests/tty/adapter.ts` + `tests/tty/index.test.ts` — TTY battery (main + worker)
- `tests/browser/adapter.ts` + `tests/browser/index.test.ts` — browser battery
- Non-shared/environment-specific tests stay where they are
- `rstest.config.ts` globs updated to cover the new layout
- No behavioural changes to any test

This phase also finalises the cleanup deferred from Phase 12 (D-06):
`parity.suite.ts`, `parity-console.test.ts`, `parity-tty.test.ts` are deleted.

</domain>

<decisions>
## Implementation Decisions

### Standalone node tests
- **D-01:** Delete `tests/node/main/formats.test.ts`, `levels.test.ts`, `mixins.test.ts`,
  `options.test.ts`, `prefix.test.ts`, `scopes.test.ts`, `spinner-node.test.ts` (7 files,
  ~748 lines). Their behavioural coverage is fully provided by the shared suites running
  through the new console battery. STRUCT-04 does not list them as files to preserve.

### Parity files (D-06 from Phase 12)
- **D-02:** Delete `tests/common/parity.suite.ts`, `tests/node/main/parity-console.test.ts`,
  `tests/tty/main/parity-tty.test.ts`. Parity is now end-to-end covered by `runSuite()`
  (every `TestCase` with `parity !== false` runs against both main and worker adapters).
  No dedicated parity test file is needed.

### Worker battery placement
- **D-03:** `tests/console/{json,logfmt,pretty}/index.test.ts` each run **two adapters**:
  the main console adapter (direct stream capture) AND the worker adapter (`releaseWorker()`
  fallback pattern). All 7 suites run against both — no separate `worker.test.ts`.
- **D-04:** `tests/tty/index.test.ts` runs `ttyAdapter` (main) **and** `ttyWorkerAdapter`
  (worker fallback). Same two-adapter pattern as console format dirs.
  `tests/browser/index.test.ts` runs the browser adapter only — no browser worker adapter
  exists.

### Non-shared tests preserved
- **D-05:** The following tests remain in their existing directories, unchanged:
  `tests/node/main/worker-protocol.test.ts`, `registry.test.ts`, `worker-e2e.test.ts`,
  `console.test.ts`, `tests/tty/main/spinner-tty.test.ts`.
  `tests/browser/main/browser.test.ts` also stays — it tests browser-specific behavior
  (CSS format strings, browser spinners) not covered by shared suites, analogous to
  `console.test.ts`.
  `tests/tty/main/battery-node-tty.test.ts` and `battery-node-tty-worker.test.ts` are
  **deleted** (replaced by `tests/tty/index.test.ts`).
  `tests/node/main/battery-node-console.test.ts` and `battery-node-console-worker.test.ts`
  are **deleted** (replaced by `tests/console/{json,logfmt,pretty}/index.test.ts`).
  `tests/browser/main/battery-browser.test.ts` is **deleted** (replaced by
  `tests/browser/index.test.ts`).

### rstest.config.ts globs
- **D-06:** The `node-console` project include array becomes:
  `['tests/console/**/*.test.ts', 'tests/node/**/*.test.ts', 'tests/common/**/*.test.ts']`
  — adds `tests/console/**` to pick up the new format dirs; keeps `tests/node/**` for
  the non-shared tests that remain in `tests/node/main/`.
  The `node-tty` and `browser` project globs are unchanged (they already match
  `tests/tty/**` and `tests/browser/**` respectively, which will cover the new files).

### Adapter content
- **the agent's Discretion:** Exact import paths, adapter function shapes, and
  `afterEach(releaseWorker)` placement in the new index.test.ts files follow the same
  patterns established in the existing battery files. Use those files as canonical templates.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Battery files to replace (canonical templates)
- `tests/node/main/battery-node-console.test.ts` — main console adapter (`makeNodeConsoleAdapter`), captureAsync, all 7 suites × 3 formats
- `tests/node/main/battery-node-console-worker.test.ts` — worker adapter (releaseWorker+WL fallback), afterEach cleanup, all 7 suites
- `tests/tty/main/battery-node-tty.test.ts` — TTY adapter
- `tests/tty/main/battery-node-tty-worker.test.ts` — TTY worker adapter
- `tests/browser/main/battery-browser.test.ts` — browser adapter (rs.spyOn), 6 suites

### Phase 12 infrastructure (already complete)
- `tests/common/suites/suite.ts` — `Suite`, `TestCase` interfaces
- `tests/common/suites/runner.ts` — `runSuite()` with parity support
- `tests/common/suites/` — all 7 declarative suite objects

### Config
- `rstest.config.ts` — 3 projects (browser, node-console, node-tty); globs and resolve.alias

### Requirements
- `.planning/REQUIREMENTS.md` §STRUCT-01..05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `makeNodeConsoleAdapter(format)` in `battery-node-console.test.ts` — extract to
  `tests/console/{format}/adapter.ts` function
- `captureAsync()` helper inline in all battery files — copy per directory (no shared
  utility to avoid cross-project import issues)
- Worker adapter setup pattern in `battery-node-console-worker.test.ts` lines with
  `releaseWorker()`, `afterEach(releaseWorker)` — templates for the worker half of
  each `index.test.ts`

### Established Patterns
- Battery files use `captureAsync()` (not `captureAll()`) for async-safe stream capture
- Worker adapters always call `releaseWorker()` in setup AND `afterEach(releaseWorker)`
- Browser adapter uses `rs.spyOn` (not process.stdout) — browser env has no streams
- `tests/tty/env.ts` provides the TTY alias stub — must NOT be modified

### Integration Points
- `rstest.config.ts` `resolve.alias` for TTY stub remains unchanged; only `include` arrays change
- All new `index.test.ts` files sit in non-common directories — picked up by the
  updated project globs, not by `tests/common/**`

</code_context>

<specifics>
## Specific Ideas

- Each `tests/console/{format}/adapter.ts` exports one named function:
  `makeConsoleAdapter(format: 'json' | 'logfmt' | 'pretty'): TestAdapter` (or a pre-instantiated
  adapter for the specific format — agent's call based on simplicity).
- `index.test.ts` in each format dir imports its own adapter + all 7 suite objects +
  `runSuite`, then runs the loop with both main and worker adapters.
- The agent may choose to put the `captureAsync` helper in a shared file under
  `tests/common/` if it avoids copy-paste — but only if the import path works cleanly
  across the 3 rstest projects (node-console, node-tty, browser don't share bundles).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-directory-restructure*
*Context gathered: 2026-03-27*

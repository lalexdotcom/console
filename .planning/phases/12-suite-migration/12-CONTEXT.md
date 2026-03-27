# Phase 12: Suite Migration — Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the 7 existing `makeSuite(adapter)` factory files to declarative `Suite` objects consumed by `runSuite()`.

Concretely:
- 7 files in `tests/common/` (`levels`, `formats`, `mixins`, `options`, `prefix`, `scopes`, `spinners`) become plain `Suite` objects exported from `tests/common/suites/`
- `tests/common/parity.suite.ts` is deleted — parity is now driven per-`TestCase` via `tc.parity !== false`
- `normalise()` is extracted from `parity.suite.ts` to `tests/common/helpers/normalise.helper.ts`
- All battery test files that called `makeSuite(adapter)` are updated to call `runSuite(suite, adapter)`
- Zero regression in test count or coverage

</domain>

<decisions>
## Implementation Decisions

### Suite setup hook
- **D-01:** Add `setup?: (adapter: TestAdapter) => void | Promise<void>` to the `Suite` interface in `tests/common/suites/suite.ts`.
- **D-02:** `runSuite()` in `tests/common/suites/runner.ts` must call `suite.setup?.(mainAdapter)` (and `suite.setup?.(workerAdapter)` when present) inside `beforeEach`, **before** any adapter-level `setup()` call, or **after** — keep the same order as the current `beforeEach` pattern. Specifically: call `await mainAdapter.setup()` first, then `await suite.setup?.(mainAdapter)`.
- **D-03:** For the worker parity run in `beforeEach`: also call `await suite.setup?.(workerAdapter)` after `await workerAdapter.setup()`.

### Parity strategy
- **D-04:** No dedicated `parity-*.test.ts` files survive Phase 12. Parity is entirely driven by `tc.parity !== false` inside each `Suite`'s `TestCase` array.
- **D-05:** `parity.suite.ts` is fully deleted (the parity test behaviour it covered already lives in the battery files that call `runSuite()` with a `workerAdapter`).
- **D-06:** The existing `parity-console.test.ts` and `parity-tty.test.ts` files are **not** in scope for Phase 12 — those are environment-level files that reference their own adapters. Their fate is decided in Phase 13 (Directory Restructure). Do not touch them in Phase 12.

### normalise() helper
- **D-07:** `tests/common/helpers/normalise.helper.ts` exports two named functions:
  - `normalise(s: string): string` — single-line transformation, this is the SSOT.
  - `normaliseLines(lines: string[]): string[]` — convenience wrapper: `lines.map(normalise)`.
- **D-08:** `normalise(s: string)` strips: ISO timestamps (`2026-…Z` → `<ts>`), caller paths (`(file.ts:28:21)` → `(<caller>)`), ANSI escape sequences. It also filters out stack trace lines (`    at /path…`) — but since `normalise` operates on a single string (not an array), the stack-trace filter moves to `normaliseLines`: filter the array **before** mapping, removing lines matching `/^\s+at\s+/`.
- **D-09:** Any existing consumer of `normalise()` (currently only `parity.suite.ts`, which is deleted) should use `normaliseLines`. No other file currently imports `normalise` — new usages in Phase 12 suites (if any) use `normalise` directly.

### the agent's Discretion
- The exact `parity` value (`true` / omitted) for each `TestCase` across the 7 suites: default is "all test cases have parity" (i.e., no `parity: false`). Set `parity: false` only where the existing `parity.suite.ts` logic or test intent explicitly excludes a case from parity. Use judgment.
- Whether to create a `tests/common/helpers/` directory or place `normalise.helper.ts` directly in `tests/common/` — the ROADMAP specifies `tests/common/helpers/normalise.helper.ts`, so use that path.

</decisions>

<specifics>
## Specific Ideas

- `levels.suite.ts` currently forces `L.format = 'json'` in its `beforeEach` (to suppress TRACE_LEVELS stack traces). This becomes `setup: async (adapter) => { L.format = 'json'; }` on the `Suite` object. The adapter parameter is available but not needed here.
- The existing `makeSuite(adapter)` factories call `describe(...)` and register tests inline. The migration replaces this with a static `Suite` object — the `describe` label is derived from `suite.name` by `runSuite()`.
- Battery test files that currently call `makeSuite(adapter)` (e.g., `battery-node-console.test.ts`: `makeLevelsSuite(adapter)`) must be updated to `runSuite(levelsSuite, adapter)`. The suite object is imported, not the factory.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 11 infrastructure (already built)
- `tests/common/suites/suite.ts` — `Suite`, `TestCase`, `RunTestFunction` interfaces. **Must be extended** with the `setup` field (D-01 above).
- `tests/common/suites/runner.ts` — `runSuite()`. **Must be updated** to call `suite.setup?.(adapter)` in `beforeEach` (D-02/D-03 above).

### Existing suites to migrate
- `tests/common/levels.suite.ts` — factory + inline `beforeEach` with `L.format = 'json'`
- `tests/common/formats.suite.ts`
- `tests/common/mixins.suite.ts`
- `tests/common/options.suite.ts`
- `tests/common/prefix.suite.ts`
- `tests/common/scopes.suite.ts`
- `tests/common/spinners.suite.ts`
- `tests/common/parity.suite.ts` — contains `normalise()` to extract; the file is deleted after extraction

### Battery test files that must be updated (caller side)
- `tests/node/main/battery-node-console.test.ts`
- `tests/node/main/battery-node-console-worker.test.ts`
- `tests/tty/main/battery-node-tty.test.ts`
- `tests/tty/main/battery-node-tty-worker.test.ts`
- `tests/browser/main/battery-browser.test.ts`

### Requirements
- `.planning/REQUIREMENTS.md` §ARCH-03, §PARITY-01, §PARITY-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/common/suites/suite.ts` (Phase 11) — extend `Suite` interface with `setup?`
- `tests/common/suites/runner.ts` (Phase 11) — extend `runSuite()` to call `suite.setup?.(adapter)` in `beforeEach`
- `tests/common/adapter.ts` — `TestAdapter` interface (import for `setup` param type)

### Established Patterns
- Each existing `makeSuite(adapter)` wraps a `describe(...)` block with a `beforeEach` calling `adapter.setup()` — this pattern is absorbed by `runSuite()`.
- `L.format = 'json'` in `levels.suite.ts` is the only suite-level setup beyond `adapter.setup()`.
- Battery files loop `adapters.forEach(adapter => makeSuiteX(adapter))` — this becomes `adapters.forEach(adapter => runSuite(suiteX, adapter))`.

### Integration Points
- No new test runner config needed — `runSuite()` uses `describe`/`test`/`beforeEach` from `@rstest/core` exactly as the factories do.

</code_context>

<deferred>
## Deferred Ideas

None surfaced during discussion.

</deferred>

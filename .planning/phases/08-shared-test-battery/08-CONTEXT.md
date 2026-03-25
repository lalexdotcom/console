# Phase 08: TestAdapter + Shared Suites + Node-Console Adapter - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 08 delivers the **foundation** of the shared test battery: the `TestAdapter` interface, all 7 parameterised suite files, and two concrete adapters (node-console + browser-main) that immediately run the suites against the existing rstest config. No rstest.config.ts changes in this phase — the split into 3 projects is Phase 10. No TTY adapter — that is Phase 09.

</domain>

<decisions>
## Implementation Decisions

### TestAdapter Interface

- **D-01:** `tests/common/adapter.ts` exports exactly the interface from PHASE.md:
  ```ts
  export interface TestAdapter {
    name: string;
    setup(): void | Promise<void>;
    capture(fn: () => void | Promise<void>): Promise<string[]>;
    readonly logger: RootLogger;
  }
  ```
  No additional properties. The `capture()` method returns normalised string lines (newlines split, empty lines stripped).

[auto] Selected: interface matches PHASE.md exactly — no deviations.

### Suite Files Content

- **D-02:** 7 suite files in `tests/common/`, each exporting `makeSuite(adapter: TestAdapter)`. File names:
  `levels.suite.ts`, `formats.suite.ts`, `scopes.suite.ts`, `options.suite.ts`, `prefix.suite.ts`, `mixins.suite.ts`, `spinners.suite.ts`
- **D-03:** Suite content = **full port** of existing `tests/node/main/*.test.ts` tests into parameterised form. The goal is identical coverage, not a minimal subset. Every `describe()` / `it()` block from the source test file becomes a test case inside `makeSuite()`.
- **D-04:** `spinners.suite.ts` covers **non-TTY spinner behavior only** (spinner in console/browser mode). TTY spinner tests remain in `tests/tty/main/spinner-tty.test.ts` — that file is not touched in this phase.

[auto] Selected: full port, not minimal subset. spinners = non-TTY only in Phase 08.

### Snapshot Strategy

- **D-05:** Use the same timestamp-replacement pattern already in `tests/node/main/formats.test.ts` — replace dynamic timestamps with a `[ts]` placeholder before `toMatchInlineSnapshot()` calls. For non-deterministic fields (caller location), strip or replace before comparison. Deterministic output uses `toMatchInlineSnapshot()`; flexible checks (e.g., "line contains level name") use `toContain()`.

[auto] Selected: reuse existing snapshot pattern, no new normalisation approach.

### node-console Adapter

- **D-06:** The `node-console` adapter builds on top of the existing `captureAll()` helper (`tests/common/capture.helper.ts`). `capture(fn)` calls `captureAll(fn)`, splits by `\n`, and strips empty lines. Three adapter variants (json, logfmt, pretty) — each sets the logger format in `setup()` and resets it on teardown via the existing `reset.helper.ts` logic.
  File: `tests/node/main/battery-node-console.test.ts` — imports the 7 suites and instantiates each with all 3 variants.

[auto] Selected: wrap captureAll(), three format variants, single test file.

### browser-main Adapter

- **D-07:** The `browser-main` adapter wraps existing Playwright infrastructure from `tests/browser/main/browser.test.ts`. It intercepts `console.log` messages via `page.on('console', ...)` and executes logger calls via `page.evaluate()`. The adapter's `logger` property returns a Playwright-side proxy (the browser execution context already provides a RootLogger via the existing browser build).
  File: `tests/browser/main/battery-browser.test.ts` — instantiates each suite with the browser adapter.

[auto] Selected: reuse existing Playwright setup, console message intercept.

### Test File Placement

- **D-08:** Adapter test files go in their respective environment directories:
  - `tests/node/main/battery-node-console.test.ts` — node-console adapter + all 7 suites
  - `tests/browser/main/battery-browser.test.ts` — browser-main adapter + all 7 suites
  These files are picked up automatically by the existing rstest config (node / browser projects) without any config change in Phase 08.

[auto] Selected: per-environment files, no rstest.config.ts change in this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/phases/08-shared-test-battery/PHASE.md` — full scope, success criteria, code examples (TestAdapter interface, suite naming, worker adapter strategy, parity suite design)

### Requirements (in-scope for this phase)
- `.planning/REQUIREMENTS.md` §v3.0.1 — BATTERY-01, BATTERY-02, BATTERY-03

### Existing test files to port into suites
- `tests/node/main/levels.test.ts`
- `tests/node/main/formats.test.ts`
- `tests/node/main/scopes.test.ts`
- `tests/node/main/options.test.ts`
- `tests/node/main/prefix.test.ts`
- `tests/node/main/mixins.test.ts`
- `tests/node/main/spinner-node.test.ts`

### Existing helpers (KEEP, use as-is)
- `tests/common/capture.helper.ts` — captureAll() used by node-console adapter
- `tests/common/reset.helper.ts` — registry reset used in adapter setup()

### Existing browser test (pattern reference for browser adapter)
- `tests/browser/main/browser.test.ts`

### Deferred requirements (do NOT implement in this phase)
- BATTERY-04, BATTERY-06 — worker adapters, tty env override → Phase 09
- BATTERY-05, BATTERY-07, VERSION-02 — rstest split, parity suite, version bump → Phase 10

</canonical_refs>

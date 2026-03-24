# Phase 1: Test Infrastructure & Code Adjustment - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Configure rstest from scratch, build shared test helpers for stdout capture (Node), console spy (browser), and singleton reset, add `error` and `warn` to `TRACE_LEVELS`, and deliver working test scripts in `package.json`. This phase produces zero feature tests — only the infrastructure that Phase 2+ will consume.

</domain>

<decisions>
## Implementation Decisions

### Test File Organization
- **D-01:** Tests live in a dedicated `tests/` directory at project root (not co-located in `src/`).
- **D-02:** Tests are grouped by runtime environment and mode:
  ```
  tests/
    helpers/        (shared utilities)
    browser/
      main/         (browser main thread)
      worker/       (browser web worker)
    node/
      main/         (Node console mode)
      worker/       (Node fork worker)
    tty/
      main/         (TTY main thread)
      worker/       (TTY worker)
  ```

### Helper Architecture
- **D-03:** One file per concern in `tests/helpers/` — e.g. `stdout.ts`, `console-spy.ts`, `reset.ts`. Each helper is independent with targeted imports.
- **D-04:** Helpers use a functional wrapper pattern — e.g. `captureStdout(() => { ... })` returns captured output. No shared mutable state, composable.

### Browser Test Strategy
- **D-05:** Chromium only (headless) via Playwright — sufficient to validate `console.log`/`%c` CSS, `groupCollapsed`, etc.
- **D-06:** Console method spying for browser assertions — intercept `console.log`/`warn`/`error` calls in the headless browser context to verify arguments (`%c`, CSS strings, `groupCollapsed` usage).

### Test Isolation
- **D-07:** Automatic fixture via `beforeEach` — rstest hook that resets the singleton registry before each test. No manual reset calls needed in individual tests.

### Agent's Discretion
- Reset depth (registry only vs. registry + state + scopes + console patch) — agent determines the appropriate level based on what the singleton exposes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Code
- `src/levels.ts` — TRACE_LEVELS Set definition (ADJ-01 target)
- `src/logger/index.ts` — Singleton registry on globalThis, core logger factory
- `src/logger/dispatch.ts` — Console method dispatch logic
- `src/logger/prefix/serialize.ts` — JSON/logfmt serialization (stdout capture target)
- `src/worker/index.ts` — Worker proxy entry point
- `src/worker/protocol.ts` — WorkerMessage discriminated union

### Project Configuration
- `rslib.config.ts` — Build config with source.exclude patterns
- `rsbuild.config.ts` — Browser dev server config (Playwright reference)
- `package.json` — Scripts section (INFRA-06 target)
- `tsconfig.json` — TypeScript strict config

### Codebase Analysis
- `.planning/codebase/TESTING.md` — Current testing state (none) and recommended areas
- `.planning/codebase/STACK.md` — Full technology stack reference
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, export conventions

### Documentation
- `.planning/REQUIREMENTS.md` — ADJ-01, INFRA-01 through INFRA-06 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TRACE_LEVELS` in `src/levels.ts` line 39 — current Set with `emerg`, `alert`, `crit`. ADJ-01 adds `error` and `warn`.
- `*.dev.ts` exclusion pattern in `rslib.config.ts` — Rslib already excludes dev files, same pattern could apply to test files if needed.
- Playground scripts in `package.json` — demonstrate all runtime modes, useful as test scenario references.

### Established Patterns
- `as const` + `satisfies` for typed constants
- Factory functions (`create*`) for constructing instances
- Discriminated unions for variant types (WorkerMessage, Prefix)
- Named exports only, barrel files for re-exports
- `import type` for type-only imports

### Integration Points
- `globalThis` singleton registry — the reset utility must know this structure to clear it
- `console` object patching (`patch()`/`unpatch()`) — must be restored during test teardown
- Worker transport via `child_process.fork()` (Node) and `MessageChannel` (browser)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for rstest configuration and helper implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-test-infrastructure-code-adjustment*
*Context gathered: 2026-03-24*

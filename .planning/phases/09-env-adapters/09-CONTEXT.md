# Phase 09: Node-TTY + Worker Adapters - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 09 delivers the 3 remaining environment adapters to complete the full adapter matrix
introduced in Phase 08: the `node-tty` adapter (backed by the `tests/tty/env.ts` static
TTY override) and both worker adapters (`node-console-worker`, `node-tty-worker`).

Each new adapter is wired inline in its own battery file that instantiates the same shared
suites as its "main" counterpart — ensuring structural parity: if the main adapter tests
pass, the worker adapter for the same environment must also pass.

No rstest.config.ts changes in this phase — that split is Phase 10.

</domain>

<decisions>
## Implementation Decisions

### tests/tty/env.ts — static TTY override

- **D-01:** `tests/tty/env.ts` re-exports everything from `src/utils/env` and statically
  overrides `isNodeTTY = true` / `isNodeConsole = false`. No env-var, no runtime logic —
  compile-time constant only. Zero changes to `src/`.

  ```ts
  export * from '../../src/utils/env';
  export const isNodeTTY = true;
  export const isNodeConsole = false;
  ```

  This file is the alias target for the `node-tty` rstest project (wired in Phase 10).
  In Phase 09 it is imported directly by the TTY battery file to activate TTY mode.

### node-tty adapter — capture strategy

- **D-02:** The TTY adapter patches `process.stdout.write` (via the existing `captureAll()`
  helper) to intercept all output, including ttyRenderer cursor sequences. Before returning
  lines, `capture()` strips ANSI/VT control sequences with `stripVTControlCharacters` from
  `node:util` so the shared suites receive clean text — identical in shape to what the
  node-console adapter returns.
  This avoids any need to modify the shared suites for TTY mode.

- **D-03:** The TTY adapter directly overrides the TTY env flags by importing from
  `tests/tty/env.ts` at the battery file level. Since rspack bundles per project and
  Phase 09 does NOT modify rstest.config.ts, the alias is NOT active yet. Instead, the
  battery file imports `isNodeTTY` from `tests/tty/env.ts` directly and sets it on the
  module-level singleton before each test via `adapter.setup()`.
  **Note:** If the logger captures `isNodeTTY` at bundle time (closed-over constant), a
  direct import override may not be sufficient. The planner/researcher must verify whether
  direct module assignment works, or whether a different patching strategy is needed for
  Phase 09.

### Worker adapters — drain strategy

- **D-04:** Both worker adapters (console-worker, tty-worker) use a **fixed setTimeout drain**
  after the logger call and before capturing output. Pattern mirrors `worker-protocol.test.ts`
  which uses `flush = () => new Promise(r => setTimeout(r, 0))`. The adapter's `capture(fn)`
  is async:
  ```ts
  async capture(fn) {
    await fn();
    await new Promise(r => setTimeout(r, 50)); // drain IPC
    return captureAll(() => {}).stdout; // or accumulated lines from intercepted writes
  }
  ```
  The exact implementation (patch stdout during drain vs post-call capture) is left to the
  researcher/planner to determine based on how IPC output reaches the main process.

- **D-05:** Both worker adapters call `releaseWorker()` in `afterEach` to destroy the fork
  between tests and prevent state leakage.

### Suites covered per adapter

- **D-06:** `battery-node-console-worker.test.ts` (console-worker adapter) exercises **all 7
  shared suites** — including `formats.suite.ts` (json/logfmt/pretty) — matching its
  `battery-node-console.test.ts` main counterpart exactly.

- **D-07:** `battery-node-tty.test.ts` (node-tty adapter) exercises **6 suites** (formats
  suite excluded — TTY mode always renders ANSI pretty, never raw json/logfmt text).

- **D-08:** `battery-node-tty-worker.test.ts` (tty-worker adapter) exercises **6 suites**
  — mirroring the tty main adapter, formats excluded.

### Parity principle

- **D-09:** For every environment × mode combination, both "main" and "worker" variants run
  the identical suite set. Passing the same suites with both adapters constitutes structural
  parity evidence. An explicit `parity.suite.ts` comparing outputs byte-by-byte is deferred
  to a later phase (BATTERY-07).

### File placement

- **D-10:** All new adapters are defined **inline** inside their battery files (same pattern
  as Phase 08 `battery-node-console.test.ts` and `battery-browser.test.ts`). No separate
  adapter file.
  New files:
  - `tests/tty/main/battery-node-tty.test.ts`
  - `tests/node/main/battery-node-console-worker.test.ts`
  - `tests/node/main/battery-node-tty-worker.test.ts`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/phases/09-env-adapters/PHASE.md` — full scope, success criteria, key technical
  notes (env.ts form, worker flush strategy, ttyRenderer fallback pattern)

### Requirements
- `.planning/REQUIREMENTS.md` §v3.0.1 — BATTERY-04, BATTERY-06

### Prior phase patterns (MUST read before implementing)
- `tests/node/main/battery-node-console.test.ts` — inline adapter + battery pattern (Phase 08)
- `tests/browser/main/battery-browser.test.ts` — inline adapter + browser capture pattern (Phase 08)
- `tests/tty/main/spinner-tty.test.ts` — ttyRenderer direct usage + captureAll pattern (Phase 03)
- `tests/node/main/worker-e2e.test.ts` — releaseWorker() usage and fallback pattern
- `tests/node/main/worker-protocol.test.ts` — IPC flush/drain pattern (setTimeout(r, 0))
- `tests/common/capture.helper.ts` — captureAll() implementation
- `src/utils/env.ts` — isNodeTTY / isNodeConsole definitions (alias targets)
- `src/worker/index.ts` — releaseWorker(), WorkerLogger proxy exports

### Phase 08 context (decisions that bind Phase 09)
- `.planning/phases/08-shared-test-battery/08-CONTEXT.md` — TestAdapter interface (D-01),
  suite naming (D-02), file placement strategy (D-08)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `captureAll()` (`tests/common/capture.helper.ts`): patches stdout/stderr.write — reusable as-is for TTY and worker capture
- `ttyRenderer` (`src/logger/mixins/spinner/tty/renderer.ts`): writes via `process.stdout.write` — captured by captureAll() automatically
- `stripVTControlCharacters` (`node:util`): strips ANSI sequences — ready for use in TTY adapter capture()
- `releaseWorker()` (`src/worker/index.ts`): destroys fork, activates fallback — must be called in afterEach

### Integration Points
- `tests/tty/env.ts` (to create): re-exports src/utils/env + overrides isNodeTTY/isNodeConsole
- Worker proxy entry: `import { L as WL, releaseWorker } from '../../../src/worker/index'`
- Battery files register with rstest via rstest.config.ts project globs (no config change needed in Phase 09)

### Known Risk
- isNodeTTY is captured at bundle evaluation time (close-over constant). Direct module
  assignment from tests/tty/env.ts may not affect already-evaluated closures in
  src/logger/index.ts. The PHASE.md notes this and suggests the Phase 10 alias as the
  real fix. For Phase 09, the researcher must determine if the battery file can activate
  TTY mode via a different mechanism (e.g., running tests under the existing rstest node-tty
  project config which may already alias env.ts, or patching the specific closed-over
  variables if accessible).

</code_context>

<specifics>
## Specific Ideas

- Pattern from PHASE.md for tests/tty/env.ts:
  ```ts
  export * from '../../src/utils/env';
  export const isNodeTTY = true;
  export const isNodeConsole = false;
  ```
- Worker drain: `await new Promise(r => setTimeout(r, 50))` after fn() call
- TTY ANSI strip: `import { stripVTControlCharacters } from 'node:util'` — already used in spinner-tty.test.ts

</specifics>

<deferred>
## Deferred Ideas

- `parity.suite.ts` comparing main vs worker output byte-by-byte (BATTERY-07) — deferred to a later phase
- rstest.config.ts split into 3 projects with source.alias for TTY — Phase 10

</deferred>

---

*Phase: 09-env-adapters*
*Context gathered: 2026-03-26*

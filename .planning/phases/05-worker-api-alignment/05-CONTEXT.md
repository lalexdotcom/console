# Phase 05: Worker API Alignment - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 05 delivers a fully aligned `/worker` public API: `@lalex/console/worker` exports `L`, `Logger`, and `releaseWorker` with types identical to the main entry. The old exports `WL`, `WorkerLogger`, and `terminateWorker` are removed (breaking). The worker script path is moved to a single constant in `src/worker/const.ts` imported by both `rslib.config.ts` and the runtime source. The `releaseWorker()` bug is fixed so calling it actually kills the fork.

Phase boundary is `src/worker/index.ts`, `src/worker/const.ts`, `rslib.config.ts`, and the two affected test files. No changes to logger internals, browser transport, or other source files.

</domain>

<decisions>
## Implementation Decisions

### New public exports for `/worker`

- **D-01:** Add `export { workerLoggerSingleton as L, workerLoggerSingleton as Logger }` — the worker proxy singleton re-exported under the canonical names. Type is `RootLogger` (already the type of `workerLoggerSingleton`).
- **D-02:** Rename `terminateWorker` → `releaseWorker` in the function declaration and export. Old function name removed from exports entirely.
- **D-03:** Remove `export { workerLoggerSingleton as WorkerLogger, workerLoggerSingleton as WL }` — these aliases are breaking removals.
- **D-04:** `L` in `/worker` is the worker proxy, NOT the main-thread logger. If the same app imports `L` from both entries, they are different objects with the same type — this is intentional and correct.

### `_terminateTransport` bug fix

- **D-05:** In `transportPromise.then()`, after `resolvedTransport = transport`, add `_terminateTransport = transport.terminate.bind(transport)`. This is where the Transport instance is available and the fork/Worker is confirmed alive. All existing tests of `terminateWorker()` (now `releaseWorker()`) validate this fix.

### Worker script path — shared constant

- **D-06:** Create `src/worker/const.ts` with a single named export:
  ```ts
  export const WORKER_FILENAME = 'worker';
  ```
- **D-07:** In `rslib.config.ts`: replace the local `const WORKER_FILENAME = 'worker'` with `import { WORKER_FILENAME } from './src/worker/const.ts'`. tsx processes this file so a `.ts` import path is valid. Remove the `source.define` block from the `/worker` proxy lib entry entirely.
- **D-08:** In `src/worker/index.ts`: delete the `__WORKER_SCRIPT__` block and replace with:
  ```ts
  import { WORKER_FILENAME } from './const';
  const _workerScriptPath: string = import.meta.url.endsWith('.ts')
    ? `./${WORKER_FILENAME}.ts`
    : `./${WORKER_FILENAME}.js`;
  ```
  The `typeof __WORKER_SCRIPT__` guard and the global declaration are both deleted.

### Browser transport — no change

- **D-09:** `createBrowserTransport()` uses `new URL('./worker.ts', import.meta.url)` as a static Rspack-analyzable literal. This is intentional and must NOT be replaced with `_workerScriptPath`. Only the Node transport path changes.

### Test file updates (in scope for Phase 05)

- **D-10:** `tests/node/main/worker-e2e.test.ts` and `tests/node/main/worker-protocol.test.ts` import removed symbols (`WL`, `WorkerLogger`, `terminateWorker`). Phase 05 MUST update these imports to the new names (`L`, `Logger`, `releaseWorker`) so that `tsc --noEmit` passes — this is Phase 05 success criteria #6.
- **D-11:** The `worker-e2e.test.ts` test "WL and WorkerLogger are the same object reference" becomes "L and Logger are the same object reference". All assertions currently using `WL` switch to `L`. Deep restructuring of test logic is NOT in scope (that's Phase 07 TEST-01..04).
- **D-12:** `worker-protocol.test.ts` uses `WL` as the import name throughout. Rename the import binding to `L` and update all usages.

### the agent's Discretion

- Whether to keep `workerLoggerSingleton` as an internal const name or rename it — the planner can decide.
- Exact ordering of exports in the bottom section of `src/worker/index.ts`.

</decisions>

<specifics>
## Specific Ideas

- The `releaseWorker` name follows the pattern of the previously existing API that was accidentally dropped in a prior version. It describes "release the worker resource" rather than "terminate" (which sounds destructive from the caller's perspective).
- The `import.meta.url.endsWith('.ts')` check is the canonical rstest-compatible path switch — rstest runs from TypeScript source so `import.meta.url` ends with `.ts`. In a production build, it ends with `.js`. No tsx subprocess execArgv manipulation needed; the check is correct by construction.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec
- `.planning/phases/05-worker-api-alignment/PHASE.md` — Full requirements, success criteria, and Key Technical Notes for all changes in this phase

### Source files to modify
- `src/worker/index.ts` — The entire worker proxy. Read the full file: exports section (bottom), `terminateWorker` function, `transportPromise.then()` callback, `_workerScriptPath` block.
- `rslib.config.ts` — Build config. The `/worker` proxy lib entry with `source.define` to be removed.

### Source files to create
- `src/worker/const.ts` — New file, does not exist yet.

### Test files to update
- `tests/node/main/worker-e2e.test.ts` — Imports `terminateWorker`, `WL`, `WorkerLogger`.
- `tests/node/main/worker-protocol.test.ts` — Imports `WL`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current exports (to be changed)
```ts
// Bottom of src/worker/index.ts
export const workerLoggerSingleton = anyGlobal[WORKER_REGISTRY_KEY] as RootLogger;
export { workerLoggerSingleton as WorkerLogger, workerLoggerSingleton as WL };
export function terminateWorker(): void { ... }
```

### Bug location (D-05)
```ts
// In transportPromise.then() — missing assignment:
transportPromise.then((transport) => {
  resolvedTransport = transport;
  // ← _terminateTransport = transport.terminate.bind(transport); MISSING HERE
  for (const msg of queue) transport.send(msg);
  queue.length = 0;
  silenceMainLogger();
})
```

### `_workerScriptPath` block (to be replaced)
```ts
// Lines ~52-56 of src/worker/index.ts
const _workerScriptPath: string =
  typeof __WORKER_SCRIPT__ !== 'undefined' ? __WORKER_SCRIPT__ : './worker.ts';
```

### rslib.config.ts — define block to remove
```ts
source: {
  entry: { index: './src/worker/index.ts' },
  define: {
    __WORKER_SCRIPT__: JSON.stringify(`./${WORKER_FILENAME}.js`),
  },
},
```

### Main logger exports (for type parity reference)
```ts
// src/logger/index.ts
export const Logger: RootLogger = registry.root;
export const L = Logger;
```

</code_context>

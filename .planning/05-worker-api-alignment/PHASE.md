# Phase 05: Worker API Alignment

**Milestone:** v3.0.0 Consolidation
**Goal:** `@lalex/console/worker` exports `L`, `Logger`, and `releaseWorker` with types identical to the main entry; worker script path sourced from a single constant in `src/worker/const.ts`; `releaseWorker` bug fixed so the fork is actually killed.

## Requirements Covered

- **ALIGN-01**: `@lalex/console/worker` exports `L` as `RootLogger` singleton — identical type to main `L`
- **ALIGN-02**: `@lalex/console/worker` exports `Logger` as the `RootLogger` constructor type — identical to main `Logger`
- **ALIGN-03**: `terminateWorker` renamed to `releaseWorker` in `src/worker/index.ts` and in the `/worker` public exports
- **ALIGN-04**: `WL` removed from `/worker` public exports (breaking)
- **ALIGN-05**: `WorkerLogger` removed from `/worker` public exports (breaking)
- **ALIGN-06**: `terminateWorker` removed from `/worker` public exports (breaking)
- **ALIGN-07**: `releaseWorker()` bug fixed — `_terminateTransport` is correctly assigned so the fork is actually killed
- **WORKER-01**: Worker script filename constant defined once in `src/worker/const.ts` — single source of truth
- **WORKER-02**: `rslib.config.ts` imports the filename constant from `src/worker/const.ts` — no hardcoded string duplication
- **WORKER-03**: `src/worker/index.ts` derives the runtime script path from the shared constant with extension switching (`import.meta.url.endsWith('.ts')`) — no `source.define`, no `typeof __WORKER_SCRIPT__` guard
- **WORKER-04**: `ERR_UNKNOWN_FILE_EXTENSION` no longer occurs in rstest — no tsx fallback needed

## Success Criteria

1. `import { L, Logger, releaseWorker } from '@lalex/console/worker'` compiles without TypeScript errors and the inferred types match their `@lalex/console` counterparts
2. `WL`, `WorkerLogger`, and `terminateWorker` are absent from the `/worker` public exports — importing any of those names is a compile error
3. After the fork is ready, `_terminateTransport` is non-null; calling `releaseWorker()` invokes it and the child process is killed (verified via `child.killed === true` or exit event)
4. `src/worker/const.ts` exports `WORKER_FILENAME`; both `rslib.config.ts` and `src/worker/index.ts` import it — no literal `'worker'` string duplicated in either file
5. `src/worker/index.ts` resolves the script path using `import.meta.url.endsWith('.ts')` extension switching — the `__WORKER_SCRIPT__` define and the `typeof __WORKER_SCRIPT__` guard are deleted
6. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### The `_terminateTransport` bug

In the current code, `_terminateTransport` is declared but never assigned — the `Transport.terminate` method is wired up inside `createNodeTransport` and `createBrowserTransport`, but the result is never stored back into `_terminateTransport`. The fix: at the call site where the resolved `Transport` is used (after the async `createNodeTransport()` promise resolves), set `_terminateTransport = transport.terminate.bind(transport)`.

### Shared constant approach

Create `src/worker/const.ts`:

```ts
// Single source of truth for the worker script filename.
// Imported by rslib.config.ts (build time) and src/worker/index.ts (runtime).
export const WORKER_FILENAME = 'worker';
```

In `rslib.config.ts` (top of file, before `defineConfig`):

```ts
import { WORKER_FILENAME } from './src/worker/const.ts';
```

> Note: rslib.config.ts is plain Node/TypeScript executed by tsx — a `.ts` import path works here.

In `src/worker/index.ts`, replace the current `__WORKER_SCRIPT__` block with:

```ts
import { WORKER_FILENAME } from './const';

const _workerScriptPath = import.meta.url.endsWith('.ts')
  ? `./${WORKER_FILENAME}.ts`   // tsx dev mode: load TypeScript source directly
  : `./${WORKER_FILENAME}.js`;  // production build: load compiled output
```

Remove the `source.define` block from `rslib.config.ts` lib[1] once this is in place.

### Public API alignment

`src/worker/index.ts` currently exports:

```ts
export { WL, WorkerLogger };       // to be removed
export { terminateWorker };         // to be renamed → releaseWorker
```

After Phase 05 the only named exports from `src/worker/index.ts` are:

```ts
export { L, Logger };              // re-exported from '../' or constructed locally
export { releaseWorker };          // renamed from terminateWorker
```

`L` and `Logger` must be the same singleton and constructor that `@lalex/console` exports — either re-exported from the main entry or obtained via the globalThis registry.

### rslib.config.ts import note

`rslib.config.ts` is processed by tsx at build time, not bundled by Rslib itself. It can safely use a TypeScript `import` from a `.ts` source file. The `WORKER_FILENAME` constant only needs to be the string `'worker'` — no type gymnastics required.

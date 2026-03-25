# Phase 09: Node-TTY + Worker Adapters

**Milestone:** v3.0.1 Shared Test Battery
**Goal:** Add the node-tty environment adapter (backed by the `tests/tty/env.ts` static override) and both worker adapters (`node-console-worker`, `node-tty-worker`) — completing the full adapter matrix so every environment is covered by the shared suites introduced in Phase 08.

## Requirements Covered

- **BATTERY-04**: Worker adapters for `node-console-worker` and `node-tty-worker`; parity-verifiable against their corresponding main adapters
- **BATTERY-06**: `tests/tty/env.ts` exports `isNodeTTY = true` and `isNodeConsole = false`; serves as the rspack source.alias target for the `node-tty` rstest project (wired in Phase 10)

## Success Criteria

1. `tests/tty/env.ts` exists, re-exports everything from `src/utils/env`, and overrides `isNodeTTY = true` / `isNodeConsole = false` — zero changes to `src/`
2. A node-tty adapter exists (e.g. `tests/tty/adapters/tty.adapter.ts`); it instantiates the logger in TTY mode using the env override and captures renderer output via the existing `ttyRenderer` call path
3. `tests/node/adapters/console-worker.adapter.ts` wraps the worker proxy, drains IPC output before returning captured lines, and calls `releaseWorker()` in teardown
4. `tests/tty/adapters/tty-worker.adapter.ts` mirrors the console-worker adapter but targets the TTY-configured worker instance
5. Each new adapter is exercised by at least one shared suite imported from Phase 08; `pnpm test` passes with all prior tests still green
6. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### tests/tty/env.ts — static TTY override

```ts
// Alias target for rspack source.alias in node-tty project (wired in Phase 10).
// Re-export everything from the real env module, then override TTY flags.
// This file lives in tests/ only — zero source changes to src/.
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
```

This file must NOT accept env-vars. It is a static compile-time override — the TTY build is always TTY.

### Worker adapter flush strategy

The worker proxy forwards messages asynchronously over IPC. Each worker adapter must:
1. Import and call `releaseWorker()` in `afterEach` / adapter teardown to destroy the fork between tests
2. After the logger call, drain with `await new Promise(r => setTimeout(r, 50))` before calling `capture()`
3. Alternatively, poll `captureAll()` until non-empty output appears (up to a reasonable timeout)

### Node-tty adapter capture strategy

The node-tty adapter cannot easily intercept the real TTY terminal (a pty). The recommended approach mirrors `tests/tty/main/spinner-tty.test.ts`: call the TTY renderer directly (bypassing `selectSpinnerFactory()`), or patch `process.stdout.write` while `isNodeTTY = true` is in effect via the alias.

### Dependency on Phase 08

Phase 09 adapter files must import the `TestAdapter` interface from `tests/common/adapter.ts` created in Phase 08. Ensure Phase 08 is committed and `tsc` clean before starting Phase 09.

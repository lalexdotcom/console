# Phase 08: Shared Test Battery & Full TTY Coverage

**Milestone:** v3.0.0 Consolidation
**Goal:** Introduce a `tests/common/` battery of shared test suites runnable across all environments (browser, node-console, node-tty, worker variants) via a `TestAdapter` abstraction; add a dedicated `node-tty` rstest project that compiles the logger with `isNodeTTY = true` using a rspack `source.alias`; ensure every environment is exercised by the same set of behavioural assertions.

## Requirements Covered

- **BATTERY-01**: `TestAdapter` interface defined in `tests/common/adapter.ts` — captures output and provides a configured `RootLogger`
- **BATTERY-02**: Shared suites in `tests/common/*.suite.ts` — each suite works with any adapter
- **BATTERY-03**: Adapters implemented for: `node-console` (json/logfmt/pretty), `node-tty`, `browser-main`
- **BATTERY-04**: Worker adapters implemented for: `node-console-worker`, `node-tty-worker` — verify main ↔ worker output parity
- **BATTERY-05**: rstest.config.ts split into 3 projects: `browser`, `node-console`, `node-tty`
- **BATTERY-06**: `tests/tty/env.ts` provides the rspack alias target with `isNodeTTY = true` — no source change in `src/`
- **BATTERY-07**: Parity suite asserts that main and worker produce identical output for each shared test case

## Success Criteria

1. `rstest.config.ts` has exactly 3 projects: `browser`, `node-console`, `node-tty`
2. The `node-tty` project uses `source.alias` to redirect `src/utils/env` → `tests/tty/env.ts`, which exports `isNodeTTY = true` and `isNodeConsole = false`; no `LLOGER_FORCE_TTY` or similar env var exists anywhere in `src/`
3. `tests/common/*.suite.ts` files contain ≥ 1 suite covering: levels, formats, scopes, options, prefix, mixins, spinners
4. Each suite is instantiated at least twice: once with a `node-console` adapter, once with a `node-tty` adapter (or browser where applicable)
5. Parity suite passes: for every shared test case, main and worker adapters produce byte-identical output lines
6. `pnpm test` passes — all previous tests still green, new tests added
7. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### rspack alias for TTY project

```ts
// rstest.config.ts — node-tty project
import path from 'node:path';
{
  name: 'node-tty',
  extends: withRslibConfig({
    modifyLibConfig: (config) => ({
      ...config,
      source: {
        ...config.source,
        alias: {
          [path.resolve(__dirname, 'src/utils/env')]:
            path.resolve(__dirname, 'tests/tty/env.ts'),
        },
      },
    }),
  }),
  include: ['tests/tty/**/*.test.ts', 'tests/common/**/*.test.ts'],
  setupFiles: ['./tests/common/reset.helper.ts'],
}
```

```ts
// tests/tty/env.ts — alias target, test infrastructure only
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
```

This file lives in `tests/tty/env.ts`, not in `src/`. Zero source changes.

### TestAdapter interface

```ts
// tests/common/adapter.ts
export interface TestAdapter {
  /** Human-readable label used in describe() titles */
  name: string;
  /** Reset logger state and apply adapter-specific config before each test */
  setup(): void | Promise<void>;
  /** Capture output produced by fn() and return normalised lines */
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  /** Direct access to the logger under test */
  readonly logger: RootLogger;
}
```

### Suite file naming convention

- `tests/common/levels.suite.ts` — all level dispatch cases
- `tests/common/formats.suite.ts` — json / logfmt / pretty output structure
- `tests/common/scopes.suite.ts` — scope creation, option inheritance
- `tests/common/options.suite.ts` — option setters, cascade
- `tests/common/prefix.suite.ts` — date, caller, uid prefix items
- `tests/common/mixins.suite.ts` — once, limit, options() override
- `tests/common/spinners.suite.ts` — spin lifecycle (start, update, success, fail)

Each file exports `makeSuite(adapter: TestAdapter)` which calls `describe()` internally.

### Worker adapter capture strategy

The worker proxy is asynchronous (fork + IPC). The worker adapter must:
1. Wrap `captureAll()` with a flush wait (`rs.waitFor` polling `captureAll` until output appears, or a fixed `await new Promise(r => setTimeout(r, 50))` drain)
2. Reset the worker singleton between tests via `releaseWorker()` + module re-import (or a dedicated test reset hook if available after Phase 05)

### Parity verification

```ts
// tests/common/parity.suite.ts
export function makeParitySuite(mainAdapter: TestAdapter, workerAdapter: TestAdapter) {
  describe(`parity: ${mainAdapter.name} ↔ ${workerAdapter.name}`, () => {
    // For each shared case, compare output line by line (ignoring timestamps)
  });
}
```

Timestamps and caller locations are stripped before comparison (regex or parseLogfmt).

### Existing tty tests

`tests/tty/main/spinner-tty.test.ts` stays as-is — it tests `ttyRenderer` directly and does not need an adapter. It runs under the `node-tty` project automatically via the `include` glob.

### Dependency on earlier phases

- Requires Phase 05: `releaseWorker()` must exist and be correct for the worker adapter teardown
- Requires Phase 06: browser build must be valid for the browser adapter to instantiate without errors
- Requires Phase 07: smoke tests gone, worker-e2e updated — clean baseline before adding the battery

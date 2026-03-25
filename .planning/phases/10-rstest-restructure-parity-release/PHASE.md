# Phase 10: rstest Restructure, Parity Suite & Release

**Milestone:** v3.0.1 Shared Test Battery
**Goal:** Restructure `rstest.config.ts` into 3 independent projects (browser, node-console, node-tty), wire the TTY source alias into the node-tty project, add the parity suite that validates main ↔ worker byte-identical output, and bump `package.json` to `3.0.1-rc.0`.

## Requirements Covered

- **BATTERY-05**: `rstest.config.ts` restructured into 3 independent projects: `browser`, `node-console`, `node-tty`
- **BATTERY-07**: Parity suite (`tests/common/parity.suite.ts`) asserts main ↔ worker output identical (timestamps stripped) for every shared case
- **VERSION-02**: `package.json` version set to `3.0.1-rc.0` at end of milestone

## Success Criteria

1. `rstest.config.ts` defines exactly 3 project objects: `browser`, `node-console`, `node-tty` — the legacy 2-project config is replaced in full
2. The `node-tty` project applies `source.alias` mapping `path.resolve(__dirname, 'src/utils/env')` → `path.resolve(__dirname, 'tests/tty/env.ts')`; no `LLOGER_FORCE_TTY` or any equivalent env-var exists in `src/`
3. Each project's `include` glob targets the correct test directory: `tests/browser/**`, `tests/node/**` + `tests/common/**`, `tests/tty/**` + `tests/common/**`
4. `tests/common/parity.suite.ts` exports `makeParitySuite(mainAdapter, workerAdapter)` — for every shared test case, main and worker adapter outputs are byte-identical after timestamp stripping
5. `pnpm test` executes all 3 projects; all tests pass (prior count preserved + new parity tests added)
6. `package.json` `version` is exactly `3.0.1-rc.0`
7. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### rstest.config.ts — 3-project structure

```ts
import path from 'node:path';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default [
  {
    name: 'browser',
    extends: withRslibConfig({ /* browser rslib config */ }),
    include: ['tests/browser/**/*.test.ts'],
    setupFiles: ['./tests/common/reset.helper.ts'],
  },
  {
    name: 'node-console',
    extends: withRslibConfig({ /* node rslib config */ }),
    include: ['tests/node/**/*.test.ts', 'tests/common/**/*.test.ts'],
    setupFiles: ['./tests/common/reset.helper.ts'],
  },
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
  },
];
```

**Note:** `tests/common/**/*.test.ts` runs in both `node-console` and `node-tty`. Suite entry files should select adapters based on the project context, or separate adapter-wiring files per environment should be placed in `tests/node/` and `tests/tty/` to avoid double-running infrastructure-only commons.

### Parity suite

```ts
// tests/common/parity.suite.ts
import type { TestAdapter } from './adapter';

function normalise(lines: string[]): string[] {
  // Strip ISO timestamps and caller paths before byte comparison
  return lines.map(l => l.replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, '<ts>').replace(/\([^)]+:\d+:\d+\)/g, '(<caller>)'));
}

export function makeParitySuite(mainAdapter: TestAdapter, workerAdapter: TestAdapter) {
  describe(`parity: ${mainAdapter.name} ↔ ${workerAdapter.name}`, () => {
    beforeEach(async () => {
      await mainAdapter.setup();
      await workerAdapter.setup();
    });

    it('info level output is byte-identical', async () => {
      const mainLines = await mainAdapter.capture(() => mainAdapter.logger.info('parity test'));
      const workerLines = await workerAdapter.capture(() => workerAdapter.logger.info('parity test'));
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });

    // Additional shared cases: error level, warn level, debug level, scoped logger
  });
}
```

### VERSION-02

Set `"version": "3.0.1-rc.0"` in `package.json`. Do NOT create a git tag — that is handled by the upversion script. Run after all tests pass.

### Dependency on Phase 09

All 4 adapter files (node-console, browser-main, node-console-worker, node-tty-worker) from Phases 08 and 09 must be committed and `tsc` clean before starting Phase 10. The parity suite instantiates adapters from both phases.

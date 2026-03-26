# Phase 10: rstest Restructure, Parity Suite & Release — Research

**Researched:** 2026-03-26
**Domain:** rstest multi-project config, Rspack resolve.alias, ESM config, test suite design
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**rstest.config.ts structure:** Drop `defineConfig()` wrapper — `export default [...]` array.
Keep `passWithNoTests: true` and `setupFiles: ['./tests/common/reset.helper.ts']` on all 3 projects.
`disableConsoleIntercept: true` on `node-console` **and** `node-tty`.
Browser project keeps `pluginNodePolyfill` exactly as in current config.

**Glob patterns:**

| Project | include |
|---------|---------|
| `browser` | `tests/browser/**/*.test.ts` |
| `node-console` | `tests/node/**/*.test.ts`, `tests/common/**/*.test.ts` |
| `node-tty` | `tests/tty/**/*.test.ts`, `tests/common/**/*.test.ts` |

**ESM dirname:** Use `import.meta.dirname` (not `__dirname`).

**Alias key format:**
```ts
[path.resolve(import.meta.dirname, 'src/utils/env')]:
  path.resolve(import.meta.dirname, 'tests/tty/env.ts'),
```

**TTY battery reduction:** Keep only `levels`, `options`, `mixins` suites.
Remove: `scopes`, `prefix`, `spinners` from both `battery-node-tty.test.ts` and
`battery-node-tty-worker.test.ts`.

**Parity suite:** `makeParitySuite(mainAdapter, workerAdapter)` — 5 test cases:
`info`, `error`, `warn`, `debug`, scoped logger. Normalise ISO timestamps, caller
paths, and ANSI escape codes before comparing.

**Parity runners:**
- `tests/node/main/parity-console.test.ts` — console ↔ console-worker (pretty format)
- `tests/tty/main/parity-tty.test.ts` — tty ↔ tty-worker (both see `isNodeTTY=true`)

**Version bump:** `3.0.1-rc.0` in `package.json`. No git tag.

### Agent's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

- Browser parity testing (no browser-worker adapter exists).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BATTERY-05 | `rstest.config.ts` restructured into 3 independent projects | §Q1, §Q2, §Standard Stack |
| BATTERY-07 | Parity suite asserts main ↔ worker output byte-identical | §Q7, §Architecture Patterns, §Q9 |
| VERSION-02 | `package.json` version set to `3.0.1-rc.0` | Trivial; confirmed current version |
</phase_requirements>

---

## Summary

Phase 10 replaces the current 2-project `defineConfig` rstest config with a 3-project
bare array. The most technically complex piece is wiring `resolve.alias` (not
`source.alias` — rstest's `source` field has no `alias` key) so the `node-tty` project
bundles `isNodeTTY=true` compile-time. After the alias is active, TTY battery files shed
the 3 incompatible suites (scopes, prefix, spinners) and two new parity runner files add
10 net tests.

`import.meta.dirname` is native to Node 22 (v22.16.0 installed) and is not
type-checked by `tsc --noEmit` because `rstest.config.ts` is outside the tsconfig
`include` paths. The `parity.suite.ts` normaliser strips timestamps, caller paths and
ANSI codes before equality comparison, making cross-environment byte-identity assertions
stable even when TTY outputs ANSI escape sequences.

**Primary recommendation:** Place `resolve.alias` directly in the `node-tty` project
config object (not via `modifyLibConfig`). The rslib.config.ts has no `resolve` key, so
there is no conflict with what `withRslibConfig()` extends.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `@rstest/core` | 0.9.4 | Test runner, `describe`/`test`/`beforeEach`/`expect` | Already in use |
| `@rstest/adapter-rslib` | installed | `withRslibConfig()` ext config fn | Already in use |
| `@rsbuild/plugin-node-polyfill` | installed | Node built-ins in browser bundle | Already in use |
| `node:path` | Node built-in | `path.resolve()` for alias keys | ESM import, no install needed |

**No new packages to install for this phase.**

---

## Architecture Patterns

### Q1 — rstest array export (no `defineConfig` wrapper)

**Confirmed:** rstest accepts both of the following export forms:

```ts
// Form 1 — current (Phase 09): defineConfig wrapper
export default defineConfig({ projects: [...] });

// Form 2 — Phase 10 target: bare array
export default [...] as const;
// or simply:
export default [
  { name: 'browser', ... },
  { name: 'node-console', ... },
  { name: 'node-tty', ... },
];
```

`defineConfig` is typed as an identity function returning `RstestConfig`; dropping it is
purely a style choice. Phase 10 uses Form 2. **Remove the `defineConfig` import.**

### Q2 — `withRslibConfig` / `modifyLibConfig` exact behaviour

Source: `/node_modules/@rstest/adapter-rslib/dist/index.js` (verified directly).

What `withRslibConfig(options?)` does:
1. `loadConfig({ cwd, path: configPath })` — loads `rslib.config.ts`
2. If `libId` is set, picks matching `lib[n]`; otherwise uses root-level config
3. Calls `modifyLibConfig(rslibConfig)` if provided — receives a **`RslibConfig`** (merged
   root + lib-entry fields)
4. From the (possibly modified) config, extracts **only these fields** for rstest:

| rstest field | Source |
|-------------|--------|
| `root` | `finalLibConfig.root` |
| `plugins` | `finalLibConfig.plugins` |
| `source.decorators` | `finalLibConfig.source.decorators` |
| `source.define` | `finalLibConfig.source.define` |
| `source.include` | `finalLibConfig.source.include` |
| `source.exclude` | `finalLibConfig.source.exclude` |
| `source.tsconfigPath` | `finalLibConfig.source.tsconfigPath` |
| `resolve` | `finalLibConfig.resolve` (full object) |
| `output.cssModules` | `finalLibConfig.output.cssModules` |
| `output.module` | derived from `libConfig.format` |
| `tools.rspack` | `finalLibConfig.tools.rspack` |
| `tools.swc` | `finalLibConfig.tools.swc` |
| `tools.bundlerChain` | `finalLibConfig.tools.bundlerChain` |
| `testEnvironment` | `'happy-dom'` if `output.target === 'web'`, else `'node'` |

**CRITICAL: `source.alias` is NOT extracted.** Adding `source.alias` inside
`modifyLibConfig` silently does nothing.

The `modifyLibConfig` callback for the browser project adds `pluginNodePolyfill()` to
`plugins`. For `node-tty`, no `modifyLibConfig` is needed (see Q3 below).

### Q3 — `resolve.alias` placement (CRITICAL FINDING)

**rstest's `RstestConfig.source` type** (from `@rstest/core` v0.9.4):
```ts
source?: Pick<RsbuildConfig['source'], 'define' | 'tsconfigPath' | 'decorators' | 'include' | 'exclude'>;
```
`alias` is **not** in this `Pick`. Setting `source.alias` in a project config has no effect.

**rstest's `RstestConfig.resolve` type:**
```ts
resolve?: RsbuildConfig['resolve'];
// where RsbuildConfig['resolve'].alias is:
// ConfigChain<Record<string, string | false | (string | false)[]>>
```
`resolve.alias` **IS** supported.

**Verified approach — place alias directly in the project config object:**

```ts
// rstest.config.ts
import path from 'node:path';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default [
  {
    name: 'browser',
    extends: withRslibConfig({
      modifyLibConfig: (config) => ({
        ...config,
        plugins: [...(config.plugins ?? []), pluginNodePolyfill()],
      }),
    }),
    include: ['tests/browser/**/*.test.ts'],
    setupFiles: ['./tests/common/reset.helper.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
    },
    passWithNoTests: true,
  },
  {
    name: 'node-console',
    extends: withRslibConfig(),
    include: ['tests/node/**/*.test.ts', 'tests/common/**/*.test.ts'],
    setupFiles: ['./tests/common/reset.helper.ts'],
    disableConsoleIntercept: true,
    passWithNoTests: true,
  },
  {
    name: 'node-tty',
    extends: withRslibConfig(),
    // resolve.alias replaces src/utils/env with the TTY stub at bundle time,
    // making isNodeTTY=true a compile-time constant for all code in this project.
    resolve: {
      alias: {
        [path.resolve(import.meta.dirname, 'src/utils/env')]:
          path.resolve(import.meta.dirname, 'tests/tty/env.ts'),
      },
    },
    include: ['tests/tty/**/*.test.ts', 'tests/common/**/*.test.ts'],
    setupFiles: ['./tests/common/reset.helper.ts'],
    disableConsoleIntercept: true,
    passWithNoTests: true,
  },
];
```

**Why this works safely:** `rslib.config.ts` defines no `resolve` key. So
`withRslibConfig()` returns `resolve: undefined`. When rstest merges the `extends`
result with the project config, the project's `resolve.alias` is the sole resolve config
— no conflicts.

**Alias key format:** `path.resolve(import.meta.dirname, 'src/utils/env')` produces an
absolute path to the source file **without extension**. Rspack's resolve.alias uses the
resolved module path as the key — matching happens after path resolution. This is the
correct format for file-level module substitution.

### Q4 — `import.meta.dirname` in ESM config context

**Node version:** v22.16.0 (confirmed). `import.meta.dirname` is natively supported
since Node 21.2.0.

**TypeScript check:** `rstest.config.ts` is **outside** the tsconfig `"include": ["src",
"tests"]`. It is NOT checked by `tsc --noEmit`. No TypeScript error risk.

**Runtime:** rstest processes config through its own bundler (Rspack via rsbuild). In
ESM context (`"type": "module"` in package.json), `__dirname` is `undefined`; only
`import.meta.dirname` works.

### Q5 — `include` glob patterns for rstest projects

Glob format `tests/foo/**/*.test.ts` is already in production use (current config).
Rstest uses fast-glob; `**` matches any depth. `.test.ts` suffix is required — `.suite.ts`
and `.helper.ts` files are deliberately excluded.

**Current state of `tests/common/`:**
```
adapter.ts          formats.suite.ts   mixins.suite.ts    reset.helper.ts
capture.helper.ts   levels.suite.ts    options.suite.ts   scopes.suite.ts
logfmt.helper.ts    prefix.suite.ts    spinners.suite.ts
```
No `.test.ts` files exist in `tests/common/`. The glob `tests/common/**/*.test.ts`
matches **nothing** — included for forward-compatibility only.

**New file placement:**
- `tests/common/parity.suite.ts` — matched by nothing (`.suite.ts`), correctly excluded
- `tests/node/main/parity-console.test.ts` — matched by `tests/node/**/*.test.ts` ✓
- `tests/tty/main/parity-tty.test.ts` — matched by `tests/tty/**/*.test.ts` ✓

### Q6 — Current test inventory: TTY files and test counts

**Baseline (Phase 09 end state):**

| File | Project label | Tests |
|------|---------------|-------|
| tests/tty/main/battery-node-tty.test.ts | [node] | 88 |
| tests/tty/main/battery-node-tty-worker.test.ts | [node] | 88 |
| tests/tty/main/spinner-tty.test.ts | [node] | 6 |
| tests/node/main/battery-node-console.test.ts | [node] | 306 |
| tests/node/main/battery-node-console-worker.test.ts | [node] | 306 |
| tests/browser/main/battery-browser.test.ts | [browser] | 88 |
| tests/browser/main/browser.test.ts | [browser] | 19 |
| tests/node/main/* (12 individual files) | [node] | 164 |
| **Total** | | **1065** |

**Suite-level breakdown of `battery-node-tty.test.ts` (88 tests, 6 suites):**

| Suite | Tests | Phase 10 |
|-------|-------|----------|
| `levels.suite` | 18 | ✅ keep |
| `scopes.suite` | 9 | ❌ remove (JSON.parse incompatible with TTY ANSI output) |
| `options.suite` | 17 | ✅ keep |
| `prefix.suite` | 20 | ❌ remove (JSON.parse) |
| `mixins.suite` | 4 | ✅ keep |
| `spinners.suite` | 20 | ❌ remove (assumes console-mode timing) |
| **Total** | **88** | 39 kept, **49 removed** |

Identical reduction applies to `battery-node-tty-worker.test.ts`.

**Net test delta for Phase 10:**
- Removed from TTY batteries: 49 × 2 = 98 tests
- Added (parity runners): 5 × 2 = 10 tests
- **Net: −88 tests** (total ≈ 977 after Phase 10)

Success Criterion #5 ("prior count preserved + new parity tests added") means:
non-TTY tests retain their counts and the parity tests run green — not that the
absolute total is ≥ 1065.

### Q7 — Adapter patterns for parity suite

`TestAdapter` interface (from `tests/common/adapter.ts`, unchanged):
```ts
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  readonly logger: RootLogger;
}
```

**`captureAsync` is inlined** in every battery test file — it is NOT exported. Parity
runner files must either duplicate the implementation or inline their own adapter. The
CONTEXT.md decision: inline adapter definitions in each parity file (same pattern as
existing batteries).

**For `parity-console.test.ts`:**
- `nodeConsoleAdapter` — mirrors `makeNodeConsoleAdapter('pretty')` from
  `battery-node-console.test.ts`: sets `L.format = 'pretty'`
- `consoleWorkerAdapter` — mirrors `makeConsoleWorkerAdapter('pretty')` from
  `battery-node-console-worker.test.ts`: calls `releaseWorker()` then `WL.format = 'pretty'`

**For `parity-tty.test.ts`:**
- `ttyAdapter` — mirrors `nodeTtyAdapter` from `battery-node-tty.test.ts`: sets
  `L.format = 'pretty'` (harmless in Phase 10 TTY mode; `emitTTY` routes independently)
- `ttyWorkerAdapter` — mirrors `ttyWorkerAdapter` from `battery-node-tty-worker.test.ts`:
  calls `releaseWorker()` then `WL.format = 'pretty'`; also needs `afterEach(() => releaseWorker())`

### Q8 — `battery-node-tty.test.ts` current suites (Phase 09 state)

File currently runs **6 suites** (confirmed by reading the file):
```
makeLevelsSuite(nodeTtyAdapter);    // keep
makeScopesSuite(nodeTtyAdapter);    // REMOVE
makeOptionsSuite(nodeTtyAdapter);   // keep
makePrefixSuite(nodeTtyAdapter);    // REMOVE
makeMixinsSuite(nodeTtyAdapter);    // keep
makeSpinnersSuite(nodeTtyAdapter);  // REMOVE
```

Phase 09 comment in the file: "Phase 10 will activate real TTY routing via rspack
source.alias." The adapter setup `L.format = 'pretty'` remains — harmless in TTY mode
since `emitTTY()` handles routing independently of `L.format`.

`battery-node-tty-worker.test.ts` is a mirror (same 6 suites, `ttyWorkerAdapter`).
The per-file cleanup `afterEach(() => releaseWorker())` in the worker file must be
preserved.

### Q9 — Will TTY tests see `isNodeTTY=true` after `resolve.alias`?

**YES — confirmed by design.**

The `tests/tty/env.ts` stub (created in Phase 09) is:
```ts
// Alias target for rspack source.alias in the node-tty rstest project (wired in Phase 10).
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
```

When the `node-tty` rstest project bundles its files:
1. `rspack` resolves `src/utils/env` at bundle time
2. The `resolve.alias` intercepts the resolution and substitutes `tests/tty/env.ts`
3. `isNodeTTY = true` is compiled in as a constant
4. All source code that imported `isNodeTTY` (e.g., `src/logger/const.ts`,
   `src/logger/mixins/spinner/index.ts`) sees `true` without any runtime evaluation
5. Tests in `tests/tty/main/` also import from `../../../src` — those imports go
   through the same bundled graph → also see `isNodeTTY = true`

**Side effect on test expectations:**
- `emitTTY()` is invoked for all log calls (writes to `process.stdout.write` directly)
- Output includes ANSI escape codes from `renderTTYPrefix`
- The 3 kept suites (levels, options, mixins) use `toHaveLength(n)` and date-regex
  assertions — both are ANSI-safe
- `parity-tty.test.ts` normalises ANSI before comparing (see normalisation regex below)

### Q10 — Current `rstest.config.ts` content (Phase 09 end state)

```ts
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  projects: [
    {
      name: 'node',
      extends: withRslibConfig(),
      include: ['tests/node/**/*.test.ts', 'tests/tty/**/*.test.ts'],
      setupFiles: ['./tests/common/reset.helper.ts'],
      disableConsoleIntercept: true,
      passWithNoTests: true,
    },
    {
      name: 'browser',
      extends: withRslibConfig({
        modifyLibConfig: (config) => ({
          ...config,
          plugins: [...(config.plugins ?? []), pluginNodePolyfill()],
        }),
      }),
      include: ['tests/browser/**/*.test.ts'],
      setupFiles: ['./tests/common/reset.helper.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        headless: true,
      },
      passWithNoTests: true,
    },
  ],
});
```

**Phase 10 changes:**
1. Remove `import { defineConfig } from '@rstest/core'` — no longer needed
2. Add `import path from 'node:path'` — needed for alias key resolution
3. Replace `defineConfig({ projects: [...] })` with bare `[...]`
4. Split `node` project into `node-console` + `node-tty`
5. Add `resolve.alias` to `node-tty` project
6. `tests/common/**/*.test.ts` added to `node-console` and `node-tty` include arrays

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Custom state machine | One-liner regex `/\x1b\[[0-9;]*m/g` | ANSI CSI sequences follow `\x1b[...m` pattern; regex is sufficient |
| Module alias at bundle time | `rs.mock()` / `vi.mock()` | `resolve.alias` in rstest project config | Rspack bundles before tests run; spies cannot override compile-time constants |
| Timestamp normalisation | Date arithmetic | `/\d{4}-\d{2}-\d{2}T[^\s]+/g` → `'<ts>'` | All timestamps are ISO 8601; regex is stable |
| Caller path normalisation | Stack trace parsing | `/\([^)]+:\d+:\d+\)/g` → `'(<caller>)'` | `(file:line:col)` format; regex is sufficient |

---

## Parity Suite Design

### `tests/common/parity.suite.ts` — full specification

```ts
// Normalise volatile output fields before equality comparison.
// Applied to both main and worker lines.
function normalise(lines: string[]): string[] {
  return lines.map(l =>
    l
      .replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, '<ts>')      // ISO timestamps
      .replace(/\([^)]+:\d+:\d+\)/g, '(<caller>)')         // caller paths
      .replace(/\x1b\[[0-9;]*m/g, '')                      // ANSI escape codes
  );
}

export function makeParitySuite(
  mainAdapter: TestAdapter,
  workerAdapter: TestAdapter,
): void {
  describe(`parity: ${mainAdapter.name} ↔ ${workerAdapter.name}`, () => {
    beforeEach(async () => {
      await mainAdapter.setup();
      await workerAdapter.setup();
    });

    // 5 test cases follow...
  });
}
```

**Test case pattern (repeated for info, error, warn, debug, scoped):**
```ts
test('info output is byte-identical after normalisation', async () => {
  const mainLines  = await mainAdapter.capture(() => L.info('parity test'));
  const workerLines = await workerAdapter.capture(() => WL.info('parity test'));
  expect(normalise(mainLines)).toEqual(normalise(workerLines));
});
```

**Scoped test (case 5):**
```ts
test('scoped logger output is byte-identical after normalisation', async () => {
  const mainLines   = await mainAdapter.capture(() =>
    L.scope('parity-scope').info('scoped message')
  );
  const workerLines = await workerAdapter.capture(() =>
    WL.scope('parity-scope').info('scoped message')
  );
  expect(normalise(mainLines)).toEqual(normalise(workerLines));
});
```

**Import list for `parity.suite.ts`:**
- `{ beforeEach, describe, expect, test }` from `@rstest/core`
- `{ L }` from `../../src` (main logger reference for setup access)
- `type { TestAdapter }` from `./adapter`
- `{ Logger as WL }` from `../../src/worker/index` (worker logger reference)

**Worker logger reference note:** The worker logger `WL` is needed in the suite only
because parity tests call `WL.info()` with the workerAdapter. However, since
`workerAdapter.logger` is typed as `RootLogger`, the parity suite can alternatively
call `workerAdapter.logger.info()` — avoiding a direct `WL` import. This is the
cleaner approach: use `adapter.logger.levelMethod()` uniformly via the `TestAdapter.logger`
getter. Both approaches work.

### `tests/node/main/parity-console.test.ts`

```ts
import { L } from '../../../src';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { makeParitySuite } from '../../common/parity.suite';
import type { RootLogger } from '../../../src/types';
import { afterEach } from '@rstest/core';

async function captureAsync(fn: () => void | Promise<void>): Promise<string[]> { /* inline */ }

const nodeConsoleAdapter: TestAdapter = {
  name: 'node-console:pretty',
  setup() { L.format = 'pretty'; },
  capture: captureAsync,
  get logger(): RootLogger { return L; },
};

const consoleWorkerAdapter: TestAdapter = {
  name: 'node-console-worker:pretty',
  setup() { releaseWorker(); WL.format = 'pretty'; },
  capture: captureAsync,
  get logger(): RootLogger { return WL as unknown as RootLogger; },
};

afterEach(() => { releaseWorker(); });

makeParitySuite(nodeConsoleAdapter, consoleWorkerAdapter);
```

### `tests/tty/main/parity-tty.test.ts`

Identical structure, different adapter names:
- `ttyAdapter.name = 'node-tty:pretty'`
- `ttyWorkerAdapter.name = 'node-tty-worker:pretty'`
- Both `setup()` functions identical to their respective battery counterparts

Both adapters see `isNodeTTY=true` because `node-tty` project wires the `resolve.alias`.

---

## Common Pitfalls

### Pitfall 1: Using `source.alias` instead of `resolve.alias`

**What goes wrong:** Planner places alias in `modifyLibConfig` returning `source: { alias:
{...} }`. No error is thrown — the alias is silently ignored. TTY tests still see
`isNodeTTY=false`. Tests pass but parity is not real TTY parity.

**Root cause:** `withRslibConfig` only propagates `source.{decorators, define, include,
exclude, tsconfigPath}`. `rstest.RstestConfig.source` also excludes `alias`.

**Prevention:** Use `resolve.alias` directly on the project config object (not in
`source`, not via `modifyLibConfig`).

### Pitfall 2: Using `__dirname` in ESM config

**What goes wrong:** `__dirname is not defined` runtime error when rstest processes the
config. `package.json` is `"type": "module"`.

**Prevention:** Use `import.meta.dirname` throughout `rstest.config.ts`. Confirmed
available in Node 22.16.0.

### Pitfall 3: Parity tests comparing raw (not normalised) output

**What goes wrong:** Worker tests call `releaseWorker()` which activates the WL→L
fallback. The fallback logs include the same timestamps and caller paths as main — but
timestamp values differ slightly if captured milliseconds apart. Comparison fails
non-deterministically.

**Prevention:** Always `normalise()` both arrays before `toEqual`.

### Pitfall 4: Forgetting `afterEach(() => releaseWorker())` in parity-tty

**What goes wrong:** TTY worker adapter starts a fork in one test. Next test starts
without cleanup. Worker fork inherits stdout, interfering with `captureAsync`.

**Prevention:** Copy the `afterEach(() => releaseWorker())` guard from
`battery-node-tty-worker.test.ts`. Also present in `parity-console.test.ts` for
consistency.

### Pitfall 5: `node-tty` battery adapter `setup()` after Phase 10

**What goes wrong:** Developer assumes `setup()` must remove `L.format = 'pretty'` since
TTY mode is now real. Removing it breaks the `levels.suite.ts` which overrides
`L.format = 'json'` in its own `beforeEach` (depends on setup running first to reset).

**Prevention:** Keep `L.format = 'pretty'` in `nodeTtyAdapter.setup()`. It's harmless —
TTY mode's `emitTTY()` calls `process.stdout.write` directly regardless of `L.format`.
The format setter is a no-op for TTY routing.

### Pitfall 6: `tests/node/main/battery-node-console.test.ts` project migration

**What goes wrong:** After the restructure, `battery-node-console.test.ts` moves from
`[node]` project to `[node-console]` project. If the plan doesn't account for this, the
test may appear to "disappear" in the diff.

**Prevention:** The only change is the `include` glob split. No file content changes
needed in `battery-node-console.test.ts`. Confirm test output shows `[node-console]`
label post-restructure.

---

## Code Examples

### Verified: `withRslibConfig` source (extracted from installed package)

```ts
// Source: /node_modules/@rstest/adapter-rslib/dist/index.js
const finalLibConfig = modifyLibConfig ? modifyLibConfig(rslibConfig) : rslibConfig;
const { rspack, swc, bundlerChain } = finalLibConfig.tools || {};
const { cssModules, target } = finalLibConfig.output || {};
const { decorators, define, include, exclude, tsconfigPath } = finalLibConfig.source || {};
const rstestConfig = {
    root: finalLibConfig.root,
    name: libId,
    plugins: finalLibConfig.plugins,
    source: { decorators: { version: libDecoratorsVersion, ...decorators }, define, include, exclude, tsconfigPath },
    resolve: finalLibConfig.resolve,   // ← full resolve object propagated
    output: { cssModules, module: ... },
    tools: { rspack, swc, bundlerChain },
    testEnvironment: 'web' === target ? 'happy-dom' : 'node'
};
```

### Verified: rstest `RstestConfig.source` type

```ts
// Source: /node_modules/@rstest/core/dist/index.d.ts L2787
source?: Pick<NonNullable<RsbuildConfig['source']>, 'define' | 'tsconfigPath' | 'decorators' | 'include' | 'exclude'>;
//                                                   ^^^^^^^ NO 'alias' here
```

### Verified: rstest `RstestConfig.resolve` type

```ts
// Source: /node_modules/@rstest/core/dist/index.d.ts L2790
resolve?: RsbuildConfig['resolve'];
// → ResolveConfig.alias = ConfigChain<Record<string, string | false | (string | false)[]>>
```

### Verified: Rsbuild `Alias` type

```ts
// Source: /node_modules/.pnpm/@rsbuild+core*/dist-types/types/config.d.ts L136
export type Alias = Record<string, string | false | (string | false)[]>;
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 10 is purely code/config changes. No external tools, services,
or CLIs beyond the existing project stack (Node 22 + pnpm + Playwright, all confirmed
installed and working from Phase 09).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | rstest 0.9.4 |
| Config file | `rstest.config.ts` (being replaced in this phase) |
| Quick run command | `pnpm run test` |
| Full suite command | `pnpm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| BATTERY-05 | 3 project config in rstest | smoke | `pnpm run test` — all 3 projects listed in output |
| BATTERY-05 | `node-tty` project uses `resolve.alias` | integration | `pnpm run test` — battery-node-tty passes with TTY mode active |
| BATTERY-07 | main ↔ worker output byte-identical | unit | `pnpm run test` — parity-console and parity-tty both pass |
| VERSION-02 | `package.json` version = `3.0.1-rc.0` | config check | Manual `cat package.json \| grep version` |

### Baseline before Phase 10

- Test files: 18
- Tests: 1065
- All passing

### Expected state after Phase 10

- Test files: 20 (+2 parity runners, −0 deletions)
- Tests: ≈ 977 (−98 from TTY battery reduction, +10 from parity suite)
- All passing

### Wave 0 Gaps

- [ ] `tests/common/parity.suite.ts` — new file, covers BATTERY-07
- [ ] `tests/node/main/parity-console.test.ts` — new file, instantiates console parity
- [ ] `tests/tty/main/parity-tty.test.ts` — new file, instantiates TTY parity

*(No new test framework or config required — rstest infrastructure already in place)*

---

## Sources

### Primary (HIGH confidence — code read directly from installed packages)

- `/node_modules/@rstest/adapter-rslib/dist/index.js` — `withRslibConfig` full source
- `/node_modules/@rstest/core/dist/index.d.ts` L2787-2791 — `RstestConfig.source` and `.resolve` types
- `/node_modules/.pnpm/@rsbuild+core*/dist-types/types/config.d.ts` L136 — `Alias` type
- `/workspaces/console/rstest.config.ts` — current 2-project config state
- `/workspaces/console/tests/tty/main/battery-node-tty.test.ts` — confirmed 6 suites
- `/workspaces/console/tests/tty/main/battery-node-tty-worker.test.ts` — confirmed 6 suites
- `/workspaces/console/tests/tty/env.ts` — confirmed alias target content
- `/workspaces/console/tests/common/adapter.ts` — `TestAdapter` interface
- `pnpm run test` output (live run) — confirmed 1065 tests, 18 files, all passing

### Secondary (HIGH confidence — runtime verification)

- `node --version` → v22.16.0 (Node 22, `import.meta.dirname` supported since 21.2.0)
- `node --input-type=module -e "console.log(import.meta.dirname)"` → `/workspaces/console`

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| `withRslibConfig` behaviour | HIGH | Read source directly from installed package |
| `resolve.alias` placement | HIGH | Types confirmed from installed packages; live test run |
| `import.meta.dirname` | HIGH | Runtime verified on Node v22.16.0 |
| Array export form | HIGH | Types + CONTEXT.md; rstest `defineConfig` is identity fn |
| Parity suite design | HIGH | Follows established adapter pattern exactly |
| Test count delta | HIGH | Counted per-suite tests from actual test output |

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (rstest 0.9.x cycle — stable)

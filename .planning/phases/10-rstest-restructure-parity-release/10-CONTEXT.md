# Phase 10: rstest Restructure, Parity Suite & Release — Context

**Phase**: 10-rstest-restructure-parity-release
**Context gathered**: 2026-03-26
**Status**: Ready to plan

---

## Goal

Restructure `rstest.config.ts` from 2 projects into 3 independent projects (`browser`,
`node-console`, `node-tty`), wire the TTY `source.alias` into the `node-tty` project,
add `tests/common/parity.suite.ts` (5 test cases), instantiate parity tests for both
console and TTY contexts, reduce TTY batteries to the 3 ANSI-compatible suites, and
bump `package.json` to `3.0.1-rc.0`.

---

## Requirements in Scope

- **BATTERY-05**: `rstest.config.ts` restructured into 3 independent projects
- **BATTERY-07**: Parity suite asserts main ↔ worker output identical (timestamps/ANSI stripped)
- **VERSION-02**: `package.json` version set to `3.0.1-rc.0`

---

## Decisions

### rstest.config.ts restructure

Drop the `defineConfig()` wrapper — use `export default [...]` array (rstest accepts both;
array is cleaner for 3 projects). Keep `passWithNoTests: true` and
`setupFiles: ['./tests/common/reset.helper.ts']` on all 3 projects.

**Project globs:**

| Project | include |
|---------|---------|
| `browser` | `tests/browser/**/*.test.ts` |
| `node-console` | `tests/node/**/*.test.ts`, `tests/common/**/*.test.ts` |
| `node-tty` | `tests/tty/**/*.test.ts`, `tests/common/**/*.test.ts` |

`tests/common/**/*.test.ts` currently matches no files (all shared files are `.suite.ts` /
`.helper.ts`) — included for forward-compatibility.

`disableConsoleIntercept: true` stays on `node-console` **and** `node-tty`.

The `browser` project keeps `pluginNodePolyfill` exactly as in the current config.

### ESM dirname for source.alias

`package.json` is `"type": "module"` — `__dirname` is undefined in ESM.
Use `import.meta.dirname` (Node 22 native, available in this runtime).

```ts
// rstest.config.ts — path resolution for source.alias key
alias: {
  [path.resolve(import.meta.dirname, 'src/utils/env')]:
    path.resolve(import.meta.dirname, 'tests/tty/env.ts'),
},
```

### TTY battery suite reduction

After Phase 10 wires `source.alias`, the `node-tty` project bundles `isNodeTTY = true`.
`emitTTY()` ignores `L.format` and always routes through TTY rendering (ANSI-prefixed text
written to `process.stdout.write` directly). This breaks suites that call `JSON.parse()`
on captured lines.

**`battery-node-tty.test.ts` and `battery-node-tty-worker.test.ts` — keep only:**

| Suite | Why compatible |
|-------|---------------|
| `levels.suite.ts` | `toHaveLength(1)` — format-agnostic; `emitTTY` always writes 1 line |
| `options.suite.ts` | Property checks + `toHaveLength(0/1)` — no JSON parsing |
| `mixins.suite.ts` | Line counts + date-bracket regex; `renderTTYPrefix` returns `getDatePrefix()` which uses `[\d{4}-\d{2}-\d{2}` format |

**Remove from TTY batteries:**

| Suite | Why incompatible |
|-------|----------------|
| `scopes.suite.ts` | `JSON.parse(lines[0])` → throws on ANSI-prefixed TTY text |
| `prefix.suite.ts` | Multiple `JSON.parse` calls on captured lines |
| `spinners.suite.ts` | Designed for non-TTY; assumes `CONSOLE_SPINNER_INTERVAL` timing; TTY spinner routes through `ttyRenderer` |

TTY spinner coverage remains in the dedicated `tests/tty/main/spinner-tty.test.ts`.
Scope/prefix structural coverage for TTY is deferred to a future phase.

`captureAsync` in TTY battery files needs no ANSI stripping for the 3 remaining suites
(assertions are line-count or date-bracket regex, both work with ANSI output).

### Parity suite: tests/common/parity.suite.ts

```ts
export function makeParitySuite(mainAdapter: TestAdapter, workerAdapter: TestAdapter)
```

**5 test cases** (full level coverage + scoped logger):

1. `info` level output byte-identical after normalisation
2. `error` level output byte-identical
3. `warn` level output byte-identical
4. `debug` level output byte-identical
5. Scoped logger — `L.scope('parity-scope').info(...)` output byte-identical

**Normalisation** (strips volatile fields before comparison):
- ISO timestamps: `/\d{4}-\d{2}-\d{2}T[^\s]+/g` → `'<ts>'`
- Caller paths: `/\([^)]+:\d+:\d+\)/g` → `'(<caller>)'`
- ANSI escape codes: `/\x1b\[[0-9;]*m/g` → `''` (needed for TTY parity)

Both adapters' `setup()` called in the shared `beforeEach`. Each test captures from main
adapter and worker adapter independently (sequential, not parallel), then compares
normalised arrays via `expect(normalise(mainLines)).toEqual(normalise(workerLines))`.

### Parity test instantiation files

Two new test files:

- **`tests/node/main/parity-console.test.ts`** — `makeParitySuite(nodeConsoleAdapter, consoleWorkerAdapter)` picked up by `node-console` project
- **`tests/tty/main/parity-tty.test.ts`** — `makeParitySuite(ttyAdapter, ttyWorkerAdapter)` picked up by `node-tty` project (both adapters bundle with `isNodeTTY = true`)

Each file imports its adapters inline (same pattern as the existing battery files).
`nodeConsoleAdapter`: imported from or duplicated from `battery-node-console.test.ts` (pretty format for parity).
`ttyAdapter`: imported from or duplicated from `battery-node-tty.test.ts` (pretty format).

### Version bump

Set `"version": "3.0.1-rc.0"` in `package.json`. No git tag — tagging is handled by
the upstream `upversion` script.

---

## Code Context

### Existing assets

| File | Status |
|------|--------|
| `rstest.config.ts` | Replace — current 2-project config |
| `tests/tty/env.ts` | Keep as-is — alias target created in Phase 09 |
| `tests/tty/main/battery-node-tty.test.ts` | Update — reduce to 3 suites |
| `tests/tty/main/battery-node-tty-worker.test.ts` | Update — reduce to 3 suites |
| `tests/node/main/battery-node-console.test.ts` | No change |
| `tests/node/main/battery-node-console-worker.test.ts` | No change |
| `tests/browser/main/battery-browser.test.ts` | No change |

### New files

| File | Purpose |
|------|---------|
| `tests/common/parity.suite.ts` | `makeParitySuite()` export |
| `tests/node/main/parity-console.test.ts` | console ↔ console-worker parity runner |
| `tests/tty/main/parity-tty.test.ts` | tty ↔ tty-worker parity runner |

### Key rstest.config.ts imports

```ts
import path from 'node:path';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { withRslibConfig } from '@rstest/adapter-rslib';
// No defineConfig import needed (array export)
```

---

## Deferred Ideas

- **Browser parity testing** — No browser-worker adapter exists. Parity for browser is out
  of scope for v3.0.1. The architect noted it "should" exist eventually — future milestone.

---

*Phase: 10-rstest-restructure-parity-release*
*Context gathered: 2026-03-26*

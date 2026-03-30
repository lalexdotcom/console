---
phase: 13-directory-restructure
plan: P03
type: execute
wave: 2
depends_on: [P01]
files_modified:
  - tests/console/pretty/adapter.ts
  - tests/console/pretty/index.test.ts
  - tests/tty/adapter.ts
  - tests/tty/index.test.ts
autonomous: true
requirements:
  - STRUCT-01
  - STRUCT-02

must_haves:
  truths:
    - "tests/console/pretty/ mirrors tests/console/json/ exactly but for pretty format"
    - "tests/tty/adapter.ts exports ttyAdapter (node-tty:pretty) and ttyWorkerAdapter (node-tty-worker:pretty)"
    - "tests/tty/index.test.ts runs exactly 3 suites (levels, options, mixins) with ttyAdapter + ttyWorkerAdapter"
    - "tests/tty/env.ts is NOT modified"
  artifacts:
    - path: "tests/console/pretty/adapter.ts"
      provides: "pretty format TestAdapters: mainAdapter + workerAdapter"
      exports: ["mainAdapter", "workerAdapter"]
    - path: "tests/console/pretty/index.test.ts"
      provides: "7 runSuite calls with both adapters"
    - path: "tests/tty/adapter.ts"
      provides: "TTY main + worker TestAdapters using captureAsync"
      exports: ["ttyAdapter", "ttyWorkerAdapter"]
    - path: "tests/tty/index.test.ts"
      provides: "3 runSuite calls with ttyAdapter + ttyWorkerAdapter"
      min_lines: 20
  key_links:
    - from: "tests/tty/adapter.ts"
      to: "tests/common/capture.helper.ts"
      via: "captureAsync named import"
      pattern: "import.*captureAsync.*../common/capture.helper"
    - from: "tests/tty/index.test.ts"
      to: "tests/tty/adapter.ts"
      via: "named imports"
      pattern: "import.*ttyAdapter.*ttyWorkerAdapter.*from.*./adapter"
---

<objective>
Create tests/console/pretty/ (completing the three console format directories) and
tests/tty/ (TTY main + worker adapters plus test — replacing the two TTY battery files).

Purpose: P02 and P03 are parallel — both depend only on P01's captureAsync. This plan
completes STRUCT-01 (console pretty dir) and establishes STRUCT-02 (tty dir with env.ts
preserved).
Output: 4 new files.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/13-directory-restructure/13-CONTEXT.md
</context>

<interfaces>
<!-- Key contracts the executor needs. No codebase exploration required. -->

From tests/common/capture.helper.ts (after P01):
```typescript
export async function captureAsync(
  fn: () => void | Promise<void>,
): Promise<string[]>;
```

From tests/tty/main/battery-node-tty.test.ts — suites to include (3 only):
```
// formats.suite excluded: TTY mode never produces raw json/logfmt
// scopes.suite excluded: calls JSON.parse() — throws on ANSI-prefixed output
// prefix.suite excluded: calls JSON.parse() — throws on ANSI-prefixed output
// spinners.suite excluded: assumes console-mode timing; TTY spinner in spinner-tty.test.ts
// Included: levelsSuite, optionsSuite, mixinsSuite
```

From tests/tty/main/battery-node-tty-worker.test.ts — worker pattern:
```typescript
const ttyWorkerAdapter: TestAdapter = {
  name: 'node-tty-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback: sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger { return WL as unknown as RootLogger; },
};
afterEach(() => { releaseWorker(); });
```

rstest.config.ts node-tty project resolve.alias (active):
```typescript
// tests/tty/env.ts is substituted for src/utils/env at bundle time → isNodeTTY=true
// All code in the node-tty bundle (including new tty/adapter.ts) runs with TTY routing active
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create tests/console/pretty/adapter.ts and tests/console/pretty/index.test.ts</name>
  <files>tests/console/pretty/adapter.ts, tests/console/pretty/index.test.ts</files>
  <read_first>
    - tests/console/json/adapter.ts — structural template (created in P02): same directory depth, same imports
    - tests/console/json/index.test.ts — structural template (created in P02): identical content needed
  </read_first>
  <action>
Create tests/console/pretty/adapter.ts — structurally identical to tests/console/json/adapter.ts
with these exact substitutions (all import paths unchanged — same directory depth):
  - mainAdapter.name:    'node-console:pretty'       (was 'node-console:json')
  - mainAdapter.setup(): L.format = 'pretty';         (was 'json')
  - workerAdapter.name:  'node-console-worker:pretty' (was 'node-console-worker:json')
  - workerAdapter.setup(): WL.format = 'pretty';      (was 'json')
All imports (L, RootLogger, releaseWorker, WL, TestAdapter, captureAsync) remain identical.

Create tests/console/pretty/index.test.ts — identical to tests/console/json/index.test.ts.
No changes needed: imports ./adapter (resolves to pretty adapter) and ../../common/suites/*
(same suite objects). All import paths are identical.
  </action>
  <verify>
    <automated>grep -c 'runSuite' tests/console/pretty/index.test.ts</automated>
  </verify>
  <done>
    - grep -c 'runSuite' tests/console/pretty/index.test.ts returns 7
    - grep 'node-console:pretty' tests/console/pretty/adapter.ts returns a match
    - grep 'node-console-worker:pretty' tests/console/pretty/adapter.ts returns a match
    - grep "L.format = 'pretty'" tests/console/pretty/adapter.ts returns a match
    - grep "WL.format = 'pretty'" tests/console/pretty/adapter.ts returns a match
  </done>
</task>

<task type="auto">
  <name>Task 2: Create tests/tty/adapter.ts and tests/tty/index.test.ts</name>
  <files>tests/tty/adapter.ts, tests/tty/index.test.ts</files>
  <read_first>
    - tests/tty/main/battery-node-tty.test.ts — ttyAdapter pattern: setup sets L.format='pretty', 3 suite names, comments on why 4 suites excluded
    - tests/tty/main/battery-node-tty-worker.test.ts — ttyWorkerAdapter pattern: releaseWorker() then WL.format='pretty', afterEach(releaseWorker), same 3 suites
    - tests/common/capture.helper.ts — confirm captureAsync exported (from P01)
    - tests/tty/env.ts — DO NOT MODIFY; this file provides isNodeTTY=true override; verify it exists as-is
  </read_first>
  <action>
Create tests/tty/adapter.ts. Import paths from tests/tty/ (one level inside tests/):
  - ../../src               → L
  - ../../src/types         → RootLogger
  - ../../src/worker/index  → releaseWorker, Logger as WL
  - ../common/adapter       → TestAdapter
  - ../common/capture.helper → captureAsync

```typescript
import { L } from '../../src';
import type { RootLogger } from '../../src/types';
import { releaseWorker, Logger as WL } from '../../src/worker/index';
import type { TestAdapter } from '../common/adapter';
import { captureAsync } from '../common/capture.helper';

// Type-level check: WL must satisfy RootLogger — compile error if API surface diverges.
const _typeCheck: RootLogger = WL as unknown as RootLogger;
void _typeCheck;

/**
 * Node-TTY main adapter — real TTY routing active via resolve.alias in rstest.config.ts.
 * The node-tty project bundles tests/tty/env.ts as src/utils/env, making isNodeTTY=true
 * a compile-time constant. Only 3 suites are run — those compatible with ANSI-prefixed
 * TTY output (no JSON.parse calls, no console-mode spinner assumptions).
 */
export const ttyAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() {
    // Force pretty format — TTY mode renders ANSI-prefixed human-readable output.
    L.format = 'pretty';
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

/**
 * Node-TTY worker adapter — mirrors ttyAdapter but routes through WL after releaseWorker().
 * After releaseWorker(), WL routes to L on the main thread. With the resolve.alias active,
 * isNodeTTY=true — real TTY routing is in effect for both adapters.
 */
export const ttyWorkerAdapter: TestAdapter = {
  name: 'node-tty-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback active: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};
```

Create tests/tty/index.test.ts. Import paths from tests/tty/:
  - @rstest/core              → afterEach
  - ../../src/worker/index    → releaseWorker
  - ../common/suites/*.suite  → levelsSuite, optionsSuite, mixinsSuite (3 only)
  - ../common/suites/runner   → runSuite
  - ./adapter                 → ttyAdapter, ttyWorkerAdapter

```typescript
import { afterEach } from '@rstest/core';
import { releaseWorker } from '../../src/worker/index';
import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { runSuite } from '../common/suites/runner';
import { ttyAdapter, ttyWorkerAdapter } from './adapter';

// Per D-04: ttyAdapter (main) and ttyWorkerAdapter (worker fallback) both run via
// runSuite's built-in parity — same pattern as console format dirs.
// 3 suites only, limited to those compatible with ANSI-prefixed TTY output:
//   formats excluded: TTY mode never produces raw json/logfmt
//   scopes/prefix excluded: call JSON.parse() — throws on ANSI TTY output
//   spinners excluded: assumes console-mode timing; TTY spinner in spinner-tty.test.ts
runSuite(levelsSuite, ttyAdapter, ttyWorkerAdapter);
runSuite(optionsSuite, ttyAdapter, ttyWorkerAdapter);
runSuite(mixinsSuite, ttyAdapter, ttyWorkerAdapter);

// Belt-and-suspenders fork cleanup — ttyWorkerAdapter.setup() already calls releaseWorker().
afterEach(() => {
  releaseWorker();
});
```
  </action>
  <verify>
    <automated>grep -c 'runSuite' tests/tty/index.test.ts</automated>
  </verify>
  <done>
    - grep -c 'runSuite' tests/tty/index.test.ts returns 3
    - grep 'export const ttyAdapter' tests/tty/adapter.ts returns a match
    - grep 'export const ttyWorkerAdapter' tests/tty/adapter.ts returns a match
    - grep 'captureAsync.*../common/capture.helper' tests/tty/adapter.ts returns a match
    - grep 'node-tty:pretty' tests/tty/adapter.ts returns a match
    - grep 'node-tty-worker:pretty' tests/tty/adapter.ts returns a match
    - ls tests/tty/env.ts returns the file (NOT deleted — env.ts is preserved)
  </done>
</task>

</tasks>

<verification>
- ls tests/console/pretty/adapter.ts tests/console/pretty/index.test.ts → both exist
- ls tests/tty/adapter.ts tests/tty/index.test.ts → both exist
- grep -c 'runSuite' tests/console/pretty/index.test.ts → 7
- grep -c 'runSuite' tests/tty/index.test.ts → 3
- grep 'ttyWorkerAdapter' tests/tty/index.test.ts → matches (used in all 3 runSuite calls)
- ls tests/tty/env.ts → still exists (not touched)
- grep 'formatsSuite\|scopesSuite\|prefixSuite\|spinnersSuite' tests/tty/index.test.ts → no match (correctly excluded)
</verification>

<success_criteria>
- tests/console/pretty/ created, mirrors json/logfmt with pretty format adapter names
- tests/tty/adapter.ts exports ttyAdapter + ttyWorkerAdapter; both import captureAsync from ../common/capture.helper
- tests/tty/index.test.ts runs exactly 3 suites (levels, options, mixins) with parity via runSuite
- tests/tty/env.ts is completely untouched — its isNodeTTY=true override remains active
</success_criteria>

<output>
After completion, create .planning/phases/13-directory-restructure/13-P03-SUMMARY.md
</output>

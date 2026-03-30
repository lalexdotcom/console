---
phase: 13-directory-restructure
plan: P02
type: execute
wave: 2
depends_on: [P01]
files_modified:
  - tests/console/json/adapter.ts
  - tests/console/json/index.test.ts
  - tests/console/logfmt/adapter.ts
  - tests/console/logfmt/index.test.ts
autonomous: true
requirements:
  - STRUCT-01

must_haves:
  truths:
    - "tests/console/json/adapter.ts exports mainAdapter (node-console:json) and workerAdapter (node-console-worker:json)"
    - "tests/console/json/index.test.ts runs all 7 suites with both mainAdapter and workerAdapter via runSuite parity"
    - "tests/console/logfmt/ mirrors tests/console/json/ exactly but for logfmt format"
    - "Both adapter files import captureAsync from ../../common/capture.helper"
  artifacts:
    - path: "tests/console/json/adapter.ts"
      provides: "json format TestAdapters: mainAdapter + workerAdapter"
      exports: ["mainAdapter", "workerAdapter"]
    - path: "tests/console/json/index.test.ts"
      provides: "7 runSuite calls with json mainAdapter + workerAdapter"
      min_lines: 20
    - path: "tests/console/logfmt/adapter.ts"
      provides: "logfmt format TestAdapters: mainAdapter + workerAdapter"
      exports: ["mainAdapter", "workerAdapter"]
    - path: "tests/console/logfmt/index.test.ts"
      provides: "7 runSuite calls with logfmt mainAdapter + workerAdapter"
  key_links:
    - from: "tests/console/json/adapter.ts"
      to: "tests/common/capture.helper.ts"
      via: "captureAsync named import"
      pattern: "import.*captureAsync.*../../common/capture.helper"
    - from: "tests/console/json/index.test.ts"
      to: "tests/console/json/adapter.ts"
      via: "named imports of mainAdapter + workerAdapter"
      pattern: "import.*mainAdapter.*workerAdapter.*from.*./adapter"
    - from: "tests/console/json/index.test.ts"
      to: "tests/common/suites/runner.ts"
      via: "runSuite import"
      pattern: "import.*runSuite.*../../common/suites/runner"
---

<objective>
Create tests/console/json/ and tests/console/logfmt/ — each with adapter.ts (main + worker
adapters for that format) and index.test.ts (all 7 shared suites run against both adapters
via runSuite's built-in parity mechanism).

Purpose: These two directories replace the json and logfmt portions of the old
battery-node-console.test.ts and battery-node-console-worker.test.ts. Adapters are now
co-located with the format they test.
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

From tests/common/adapter.ts:
```typescript
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  readonly logger: RootLogger;
}
```

From tests/common/suites/runner.ts:
```typescript
export function runSuite(
  suite: Suite,
  mainAdapter: TestAdapter,
  workerAdapter?: TestAdapter,
): void;
// When workerAdapter provided + tc.parity !== false: tc.run() called against BOTH adapters
// in the same test() body. This replaces the old separate-battery-file pattern.
```

From tests/common/capture.helper.ts (after P01):
```typescript
export async function captureAsync(
  fn: () => void | Promise<void>,
): Promise<string[]>;
```

From src/worker/index (releaseWorker + WL):
```typescript
export function releaseWorker(): void; // idempotent: kills fork, activates WL→L fallback
export { Logger as WL };              // WL: same API as L after releaseWorker()
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create tests/console/json/adapter.ts and tests/console/json/index.test.ts</name>
  <files>tests/console/json/adapter.ts, tests/console/json/index.test.ts</files>
  <read_first>
    - tests/node/main/battery-node-console.test.ts — makeNodeConsoleAdapter pattern (lines 52–70): setup sets L.format, capture: captureAsync, logger getter returns L
    - tests/node/main/battery-node-console-worker.test.ts — makeConsoleWorkerAdapter pattern (lines 60–84): _typeCheck, releaseWorker() before WL.format assignment, afterEach cleanup
    - tests/common/capture.helper.ts — confirm captureAsync is now exported (created in P01)
  </read_first>
  <action>
Create tests/console/json/adapter.ts. Import paths from tests/console/json/:
  - ../../../src            → L
  - ../../../src/types      → RootLogger
  - ../../../src/worker/index → releaseWorker, Logger as WL
  - ../../common/adapter    → TestAdapter
  - ../../common/capture.helper → captureAsync

```typescript
import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { captureAsync } from '../../common/capture.helper';

// Type-level check: WL must satisfy RootLogger — compile error if API surface diverges.
const _typeCheck: RootLogger = WL as unknown as RootLogger;
void _typeCheck;

/**
 * Main console adapter for json format.
 * setup() sets L.format = 'json' after global registry reset (reset.helper.ts handles reset).
 */
export const mainAdapter: TestAdapter = {
  name: 'node-console:json',
  setup() {
    L.format = 'json';
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

/**
 * Worker console adapter for json format.
 * setup() calls releaseWorker() first to kill the fork and activate WL→L fallback,
 * then sets WL.format. Order is critical: setting WL.format before releaseWorker() sends
 * an IPC opt:format message to the fork, invisible to captureAsync on the main thread.
 */
export const workerAdapter: TestAdapter = {
  name: 'node-console-worker:json',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'json'; // after fallback active: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};
```

Create tests/console/json/index.test.ts. Import paths from tests/console/json/:
  - @rstest/core             → afterEach
  - ../../../src/worker/index → releaseWorker
  - ../../common/suites/*.suite → all 7 suite objects
  - ../../common/suites/runner → runSuite
  - ./adapter                → mainAdapter, workerAdapter

```typescript
import { afterEach } from '@rstest/core';
import { releaseWorker } from '../../../src/worker/index';
import { formatsSuite } from '../../common/suites/formats.suite';
import { levelsSuite } from '../../common/suites/levels.suite';
import { mixinsSuite } from '../../common/suites/mixins.suite';
import { optionsSuite } from '../../common/suites/options.suite';
import { prefixSuite } from '../../common/suites/prefix.suite';
import { runSuite } from '../../common/suites/runner';
import { scopesSuite } from '../../common/suites/scopes.suite';
import { spinnersSuite } from '../../common/suites/spinners.suite';
import { mainAdapter, workerAdapter } from './adapter';

// Per D-03: all 7 suites run against both mainAdapter (direct stream capture) and
// workerAdapter (releaseWorker() fallback). runSuite re-runs each TestCase against
// workerAdapter when parity !== false (default), demonstrating structural API parity.
runSuite(levelsSuite, mainAdapter, workerAdapter);
runSuite(formatsSuite, mainAdapter, workerAdapter);
runSuite(scopesSuite, mainAdapter, workerAdapter);
runSuite(optionsSuite, mainAdapter, workerAdapter);
runSuite(prefixSuite, mainAdapter, workerAdapter);
runSuite(mixinsSuite, mainAdapter, workerAdapter);
runSuite(spinnersSuite, mainAdapter, workerAdapter);

// Belt-and-suspenders fork cleanup — workerAdapter.setup() already calls releaseWorker()
// in each test's beforeEach. This afterEach ensures cleanup on unexpected failures.
afterEach(() => {
  releaseWorker();
});
```
  </action>
  <verify>
    <automated>grep -c 'runSuite' tests/console/json/index.test.ts</automated>
  </verify>
  <done>
    - grep -c 'runSuite' tests/console/json/index.test.ts returns 7
    - grep 'node-console:json' tests/console/json/adapter.ts returns a match
    - grep 'node-console-worker:json' tests/console/json/adapter.ts returns a match
    - grep 'captureAsync.*../../common/capture.helper' tests/console/json/adapter.ts returns a match
    - grep 'workerAdapter' tests/console/json/index.test.ts returns matches (used in all runSuite calls)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create tests/console/logfmt/adapter.ts and tests/console/logfmt/index.test.ts</name>
  <files>tests/console/logfmt/adapter.ts, tests/console/logfmt/index.test.ts</files>
  <read_first>
    - tests/console/json/adapter.ts — template just created in Task 1: use identical structure
    - tests/console/json/index.test.ts — template just created in Task 1: use identical structure
  </read_first>
  <action>
Create tests/console/logfmt/adapter.ts — structurally identical to tests/console/json/adapter.ts
with these exact substitutions (all import paths are unchanged — same directory depth):
  - mainAdapter.name:    'node-console:logfmt'    (was 'node-console:json')
  - mainAdapter.setup(): L.format = 'logfmt';      (was 'json')
  - workerAdapter.name:  'node-console-worker:logfmt' (was 'node-console-worker:json')
  - workerAdapter.setup(): WL.format = 'logfmt';   (was 'json')
All imports (L, RootLogger, releaseWorker, WL, TestAdapter, captureAsync) remain identical.

Create tests/console/logfmt/index.test.ts — identical to tests/console/json/index.test.ts.
No changes needed: it imports from ./adapter (which now resolves to logfmt adapter) and
../../common/suites/* (same suite objects). All import paths are identical.
  </action>
  <verify>
    <automated>grep -c 'runSuite' tests/console/logfmt/index.test.ts</automated>
  </verify>
  <done>
    - grep -c 'runSuite' tests/console/logfmt/index.test.ts returns 7
    - grep 'node-console:logfmt' tests/console/logfmt/adapter.ts returns a match
    - grep 'node-console-worker:logfmt' tests/console/logfmt/adapter.ts returns a match
    - grep "L.format = 'logfmt'" tests/console/logfmt/adapter.ts returns a match
    - grep "WL.format = 'logfmt'" tests/console/logfmt/adapter.ts returns a match
  </done>
</task>

</tasks>

<verification>
- ls tests/console/json/adapter.ts tests/console/json/index.test.ts → both exist
- ls tests/console/logfmt/adapter.ts tests/console/logfmt/index.test.ts → both exist
- grep -c 'runSuite' tests/console/json/index.test.ts → 7
- grep -c 'runSuite' tests/console/logfmt/index.test.ts → 7
- grep 'import.*captureAsync' tests/console/json/adapter.ts → matches
- grep 'import.*captureAsync' tests/console/logfmt/adapter.ts → matches
- grep 'export const mainAdapter' tests/console/json/adapter.ts → matches
- grep 'export const workerAdapter' tests/console/logfmt/adapter.ts → matches
</verification>

<success_criteria>
- tests/console/json/ fully created: adapter.ts exports mainAdapter + workerAdapter for json format,
  index.test.ts runs all 7 suites with runSuite parity
- tests/console/logfmt/ fully created: mirrors json dir exactly but for logfmt format
- Both adapter.ts files import captureAsync from ../../common/capture.helper (no inline copy)
- Both index.test.ts files include afterEach(releaseWorker) as belt-and-suspenders cleanup
</success_criteria>

<output>
After completion, create .planning/phases/13-directory-restructure/13-P02-SUMMARY.md
</output>

---
phase: 13-directory-restructure
plan: P01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/common/capture.helper.ts
  - tests/browser/adapter.ts
  - tests/browser/index.test.ts
autonomous: true
requirements:
  - STRUCT-03

must_haves:
  truths:
    - "captureAsync is exported from tests/common/capture.helper.ts"
    - "tests/browser/adapter.ts exports browserAdapter conforming to TestAdapter"
    - "tests/browser/index.test.ts runs exactly 6 suites (levels, scopes, options, prefix, mixins, spinners) with browserAdapter"
  artifacts:
    - path: "tests/common/capture.helper.ts"
      provides: "captureAsync async-safe stream capture export"
      exports: ["captureAsync"]
    - path: "tests/browser/adapter.ts"
      provides: "browser TestAdapter using rs.spyOn interception"
      exports: ["browserAdapter"]
    - path: "tests/browser/index.test.ts"
      provides: "6 runSuite invocations for browser rstest project"
      min_lines: 15
  key_links:
    - from: "tests/browser/adapter.ts"
      to: "@rstest/core"
      via: "rs.spyOn import"
      pattern: "import.*rs.*@rstest/core"
    - from: "tests/browser/index.test.ts"
      to: "tests/browser/adapter.ts"
      via: "named import"
      pattern: "import.*browserAdapter.*from.*./adapter"
---

<objective>
Lay the foundation for the new directory layout: add the async-safe captureAsync export to
the shared capture helper (needed by all node-based adapters in waves 2+), then create the
browser adapter and test harness which are independent of captureAsync.

Purpose: captureAsync must be available in tests/common/ before console/tty adapters can
import it. The browser adapter/test can be created in the same wave since it uses rs.spyOn
and requires no captureAsync.
Output: Updated tests/common/capture.helper.ts with captureAsync export;
new tests/browser/adapter.ts and tests/browser/index.test.ts.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/13-directory-restructure/13-CONTEXT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add captureAsync to tests/common/capture.helper.ts</name>
  <files>tests/common/capture.helper.ts</files>
  <read_first>
    - tests/common/capture.helper.ts — read the full file to see current exports and where to append
    - tests/node/main/battery-node-console.test.ts — reference implementation of captureAsync (lines 19–46): exact intercept logic, TextDecoder usage, normalise-lines return
  </read_first>
  <action>
Append the following exported function after the closing brace of the existing `captureAll`
function in tests/common/capture.helper.ts:

```typescript
/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Required for battery adapters because spinners.suite exec() tests await an async
 * callback (SPIN-04). Synchronous captureAll() would not drain spinner state correctly.
 */
export async function captureAsync(
  fn: () => void | Promise<void>,
): Promise<string[]> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  const intercept = (chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };

  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return chunks
    .join('\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}
```
  </action>
  <verify>
    <automated>grep -n 'export async function captureAsync' tests/common/capture.helper.ts</automated>
  </verify>
  <done>
    - grep returns a match with the function declaration line
    - The existing captureAll export is untouched (grep confirms it still exists)
    - No TypeScript errors in the file
  </done>
</task>

<task type="auto">
  <name>Task 2: Create tests/browser/adapter.ts and tests/browser/index.test.ts</name>
  <files>tests/browser/adapter.ts, tests/browser/index.test.ts</files>
  <read_first>
    - tests/browser/main/battery-browser.test.ts — canonical template: rs.spyOn on 5 console methods (log, warn, error, debug, groupCollapsed), spy.mock.calls collection, stack-trace filter regex /^\s+at /
    - tests/common/adapter.ts — TestAdapter interface: name, setup(), capture(), logger getter
    - tests/common/suites/runner.ts — runSuite(suite, mainAdapter, workerAdapter?) signature; workerAdapter omitted for browser (no browser worker)
  </read_first>
  <action>
Create tests/browser/adapter.ts with the content below.
Import paths from tests/browser/ (one level inside workspace): ../../src, ../common/adapter.

```typescript
import { rs } from '@rstest/core';
import { L } from '../../src';
import type { RootLogger } from '../../src/types';
import type { TestAdapter } from '../common/adapter';

/**
 * Browser TestAdapter: intercepts all console methods using rs.spyOn.
 * Collects the first argument of each spy call (the %c format string or message string).
 * Stack trace entries (lines starting with whitespace + 'at ') are filtered out so
 * TRACE_LEVELS produce exactly one captured line per emit.
 *
 * rs.spyOn is the only available interception mechanism in browser tests — there is
 * no process.stdout in the browser environment (confirmed by existing browser.test.ts).
 */
export const browserAdapter: TestAdapter = {
  name: 'browser-main',
  setup() {
    // L.format is not meaningful in browser (output is always CSS %c).
    // reset.helper.ts handles registry reset globally via setupFiles.
  },
  async capture(fn: () => void | Promise<void>): Promise<string[]> {
    const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
    const groupSpy = rs
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});

    try {
      await fn();
      return [
        ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
      ].filter((l) => l.length > 0 && !/^\s+at /.test(l));
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
      groupSpy.mockRestore();
    }
  },
  get logger(): RootLogger {
    return L;
  },
};
```

Create tests/browser/index.test.ts with the content below.
Import paths: ../common/suites/*, ./adapter (all correct from tests/browser/).

```typescript
import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { prefixSuite } from '../common/suites/prefix.suite';
import { runSuite } from '../common/suites/runner';
import { scopesSuite } from '../common/suites/scopes.suite';
import { spinnersSuite } from '../common/suites/spinners.suite';
import { browserAdapter } from './adapter';

// Per D-04: browser adapter only — no browser worker adapter exists.
// formats.suite excluded: browser output is always CSS %c format strings;
// JSON.parse / parseLogfmt in formats suite would throw on '%c...' output.
runSuite(levelsSuite, browserAdapter);
runSuite(scopesSuite, browserAdapter);
runSuite(optionsSuite, browserAdapter);
runSuite(prefixSuite, browserAdapter);
runSuite(mixinsSuite, browserAdapter);
runSuite(spinnersSuite, browserAdapter);
```
  </action>
  <verify>
    <automated>grep -c 'runSuite' tests/browser/index.test.ts</automated>
  </verify>
  <done>
    - grep -c 'runSuite' tests/browser/index.test.ts returns 6
    - grep 'export const browserAdapter' tests/browser/adapter.ts returns a match
    - grep 'name:.*browser-main' tests/browser/adapter.ts returns a match
    - grep 'groupCollapsed' tests/browser/adapter.ts returns a match (5 spy methods present)
    - formatsSuite is NOT imported in tests/browser/index.test.ts
  </done>
</task>

</tasks>

<verification>
- grep -n 'export async function captureAsync' tests/common/capture.helper.ts → matches
- grep -n 'export function captureAll' tests/common/capture.helper.ts → still present (not deleted)
- grep -c 'runSuite' tests/browser/index.test.ts → 6
- grep 'export const browserAdapter' tests/browser/adapter.ts → 1 match
- ls tests/browser/adapter.ts tests/browser/index.test.ts → both files exist
</verification>

<success_criteria>
- tests/common/capture.helper.ts exports both captureAll (sync, existing) and captureAsync (async, new)
- tests/browser/adapter.ts exists and exports browserAdapter with name 'browser-main', uses rs.spyOn on 5 console methods
- tests/browser/index.test.ts runs 6 suites (levels, scopes, options, prefix, mixins, spinners); formats excluded
</success_criteria>

<output>
After completion, create .planning/phases/13-directory-restructure/13-P01-SUMMARY.md
</output>

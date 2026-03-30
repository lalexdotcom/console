---
phase: 16-browser-playwright-direct
plan: P03
type: execute
wave: 3
depends_on: [P01, P02]
files_modified:
  - tests/browser/index.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "tests/browser/index.test.ts has a beforeAll that starts a rsbuild dev server on port 7357"
    - "tests/browser/index.test.ts has a beforeAll that launches a headless Chromium browser"
    - "tests/browser/index.test.ts creates a workerPage (Page B) navigated to http://localhost:7357/"
    - "tests/browser/index.test.ts has an afterAll that closes the browser and the rsbuild server"
    - "All six runSuite() calls pass browserWorkerAdapter as the third argument"
    - "browserWorkerAdapter is created at module level using createBrowserWorkerAdapter(workerPageRef)"
    - "workerPageRef.page is assigned in beforeAll after the page navigates to the fixture"
  artifacts:
    - path: "tests/browser/index.test.ts"
      provides: "Browser test runner with Playwright lifecycle + parity runs for all suites"
  key_links:
    - from: "tests/browser/index.test.ts"
      to: "tests/browser/adapter.ts"
      via: "import { browserAdapter, createBrowserWorkerAdapter }"
      pattern: "createBrowserWorkerAdapter"
    - from: "tests/browser/index.test.ts"
      to: "tests/browser/fixture/index.ts"
      via: "rsbuild entry: { index: './tests/browser/fixture/index.ts' }"
      pattern: "fixture"
    - from: "tests/browser/index.test.ts"
      to: "playwright"
      via: "import { chromium } from 'playwright'"
      pattern: "chromium"
---

<objective>
Rewrite tests/browser/index.test.ts to:
1. Start a rsbuild dev server (port 7357, fixture entry point) in beforeAll
2. Launch a headless Chromium browser + create a worker page (Page B) in beforeAll
3. Navigate the worker page to http://localhost:7357/ so window.WL is available
4. Create browserWorkerAdapter at module level using a workerPageRef reference object
5. Pass browserWorkerAdapter as the second (parity) adapter to all six runSuite() calls
6. Tear down browser + server in afterAll

Purpose: Wire the Playwright lifecycle into the test runner so all common suites get
automated parity runs against the browser-worker adapter. The workerPageRef pattern
decouples adapter creation (module load time) from page availability (afterAll time).

Output: tests/browser/index.test.ts fully rewritten.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md

<interfaces>
<!-- Key contracts from P02 and the research — extracted for executor reference -->

From tests/browser/adapter.ts (produced by P02):
```typescript
export const browserAdapter: TestAdapter;    // name: 'browser-main'
export function createBrowserWorkerAdapter(ref: { page: Page | null }): TestAdapter; // name: 'browser-worker'
```

From tests/common/suites/runner.ts:
```typescript
export function runSuite(
  suite: Suite,
  mainAdapter: TestAdapter,
  workerAdapter?: TestAdapter,
): void;
```

rsbuild programmatic API (from RESEARCH.md Q1 — verified):
```typescript
import { createRsbuild } from '@rsbuild/core';
const rsbuild = await createRsbuild({ config: { ... } });
const { server } = await rsbuild.startDevServer({ getPortSilently: true });
// server.close() is async: await server.close()
```

Playwright API (from RESEARCH.md Q4 — verified):
```typescript
import { chromium } from 'playwright'; // NOT @playwright/test — not installed
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:7357/');
await context.close(); // closes all pages
await browser.close();
```

Current index.test.ts suites (to preserve all six):
```typescript
runSuite(levelsSuite, browserAdapter);
runSuite(scopesSuite, browserAdapter);
runSuite(optionsSuite, browserAdapter);
runSuite(prefixSuite, browserAdapter);
runSuite(mixinsSuite, browserAdapter);
runSuite(spinnersSuite, browserAdapter);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite index.test.ts with Playwright lifecycle + worker adapter</name>
  <files>tests/browser/index.test.ts</files>

  <read_first>
    - tests/browser/index.test.ts — read current file IN FULL before rewriting
    - tests/browser/adapter.ts — confirm exact export names from P02 before importing
    - .planning/phases/16-browser-playwright-direct/16-P02-SUMMARY.md — if it exists, verify P02 adapter exports
  </read_first>

  <action>
Replace the entire content of tests/browser/index.test.ts with:

```typescript
import { afterAll, beforeAll } from '@rstest/core';
import { createRsbuild } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { prefixSuite } from '../common/suites/prefix.suite';
import { runSuite } from '../common/suites/runner';
import { scopesSuite } from '../common/suites/scopes.suite';
import { spinnersSuite } from '../common/suites/spinners.suite';
import { browserAdapter, createBrowserWorkerAdapter } from './adapter';

// Late-bound reference for the worker page (Page B).
// Filled in by beforeAll once Playwright is ready; accessed by the adapter's
// logger getter during test execution (always after beforeAll completes).
const workerPageRef: { page: Page | null } = { page: null };

// Create the worker adapter at module level so runSuite() can register it.
// The workerPageRef.page is null until beforeAll sets it — safe because tests
// only run after beforeAll has completed.
const browserWorkerAdapter = createBrowserWorkerAdapter(workerPageRef);

// Playwright + rsbuild server lifecycle — shared across all suites in this file.
let browser: Browser;
let context: BrowserContext;
let rsbuildServer: { close: () => Promise<void> };

beforeAll(async () => {
  // Start the rsbuild dev server at fixed port 7357 serving the fixture bundle.
  // mode: 'development' ensures import.meta.env.DEV = true in the fixture so
  // BROWSER_SPINNER_INTERVAL = 500ms, matching the constant imported by spinners.suite.
  const rsbuild = await createRsbuild({
    config: {
      plugins: [pluginNodePolyfill()],
      source: {
        entry: { index: './tests/browser/fixture/index.ts' },
      },
      server: { port: 7357 },
      mode: 'development',
    },
  });
  ({ server: rsbuildServer } = await rsbuild.startDevServer({
    getPortSilently: true,
  }));

  // Launch headless Chromium and create Page B (worker relay).
  // Page B navigates to the fixture which exposes window.L and window.WL.
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  workerPageRef.page = await context.newPage();
  await workerPageRef.page.goto('http://localhost:7357/');
});

afterAll(async () => {
  // Close in reverse order: pages via context, then browser, then dev server.
  await context?.close();
  await browser?.close();
  await rsbuildServer?.close();
});

// All common suites run with browserAdapter as primary and browserWorkerAdapter
// as parity adapter. Parity runs verify 'browser-worker' name constant selection
// and that the adapter infrastructure does not break Node-side L test cases.
runSuite(levelsSuite, browserAdapter, browserWorkerAdapter);
runSuite(scopesSuite, browserAdapter, browserWorkerAdapter);
runSuite(optionsSuite, browserAdapter, browserWorkerAdapter);
runSuite(prefixSuite, browserAdapter, browserWorkerAdapter);
runSuite(mixinsSuite, browserAdapter, browserWorkerAdapter);
runSuite(spinnersSuite, browserAdapter, browserWorkerAdapter);
```

Key implementation notes:
- `workerPageRef` is created at module level, page is null until beforeAll
- `browserWorkerAdapter` is created at module level — safe because adapter methods
  are not called until tests execute (after beforeAll)
- `pluginNodePolyfill` import in THIS file (not in rstest.config.ts, which was cleaned in P01)
- rsbuild server uses fixed port 7357 (no dynamic port selection)
- `getPortSilently: true` suppresses rsbuild's port log output during test runs
- afterAll uses optional chaining (`?.`) to guard against partial beforeAll failures
- No `import path from 'node:path'` needed (fixture path is a relative string)
</action>

  <verify>
    <automated>
      grep -n "createBrowserWorkerAdapter" tests/browser/index.test.ts
      grep -n "beforeAll\|afterAll" tests/browser/index.test.ts
      grep -n "chromium.launch" tests/browser/index.test.ts
      grep -n "createRsbuild" tests/browser/index.test.ts
      grep -n "port: 7357" tests/browser/index.test.ts
      grep -n "localhost:7357" tests/browser/index.test.ts
      grep -c "runSuite.*browserWorkerAdapter" tests/browser/index.test.ts
    </automated>
  </verify>

  <done>
    - File uses beforeAll/afterAll (not describe-level setup)
    - chromium.launch({ headless: true }) called in beforeAll
    - createRsbuild called in beforeAll with port 7357
    - workerPageRef.page assigned in beforeAll
    - workerPage navigates to 'http://localhost:7357/'
    - afterAll closes context, browser, and rsbuildServer
    - All six runSuite() calls include browserWorkerAdapter as third argument
    - createBrowserWorkerAdapter(workerPageRef) called at module level
    - No TypeScript errors
  </done>

  <acceptance_criteria>
    - `grep "createBrowserWorkerAdapter(workerPageRef)" tests/browser/index.test.ts` exits 0
    - `grep "port: 7357" tests/browser/index.test.ts` exits 0
    - `grep "localhost:7357" tests/browser/index.test.ts` exits 0
    - `grep -c "runSuite.*browserWorkerAdapter" tests/browser/index.test.ts` outputs `6`
    - `grep "chromium.launch" tests/browser/index.test.ts` exits 0
    - `grep "rsbuildServer?.close()" tests/browser/index.test.ts` exits 0 (safe teardown)
    - `grep "getPortSilently: true" tests/browser/index.test.ts` exits 0
    - `grep "from 'playwright'" tests/browser/index.test.ts` exits 0 (NOT @playwright/test)
    - `grep "@playwright/test" tests/browser/index.test.ts` exits 1 (must NOT be present)
    - `pnpm exec tsc --noEmit` exits 0 (no TypeScript errors)
    - `pnpm run test` exits 0 (all browser project tests pass)
  </acceptance_criteria>
</task>

</tasks>

<verification>
After the task:
- [ ] `grep -c "runSuite.*browserWorkerAdapter" tests/browser/index.test.ts` → 6
- [ ] `grep "chromium.launch" tests/browser/index.test.ts` succeeds
- [ ] `grep "createRsbuild" tests/browser/index.test.ts` succeeds
- [ ] `grep "port: 7357" tests/browser/index.test.ts` succeeds
- [ ] `grep "@playwright/test" tests/browser/index.test.ts` returns nothing
- [ ] `pnpm run test` runs all browser project suites (levels, scopes, options, prefix, mixins, spinners) × 2 adapters with no failures
</verification>

<success_criteria>
- index.test.ts launches a rsbuild dev server + Playwright browser in beforeAll
- All six suites run with both browserAdapter and browserWorkerAdapter
- afterAll correctly tears down browser and server in all cases
- Import uses 'playwright' (not '@playwright/test' which is not installed)
- pnpm run test exits 0 for the browser project
</success_criteria>

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-P03-SUMMARY.md`
</output>

---
phase: 16-browser-playwright-direct
plan: P01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/browser/fixture/index.ts
  - rstest.config.ts
  - tests/browser/browser.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "tests/browser/fixture/index.ts exists and assigns window.L and window.WL"
    - "rstest.config.ts browser project has no browser.enabled key"
    - "rstest.config.ts browser project has no pluginNodePolyfill() call"
    - "rstest.config.ts does not import pluginNodePolyfill"
    - "tests/browser/browser.test.ts does not exist"
  artifacts:
    - path: "tests/browser/fixture/index.ts"
      provides: "Browser fixture entry point: exposes window.L and window.WL"
    - path: "rstest.config.ts"
      provides: "Rstest config with browser project as plain Node project"
  key_links:
    - from: "tests/browser/fixture/index.ts"
      to: "src/index.ts"
      via: "import { L } from '../../../src/index'"
      pattern: "from.*src/index"
    - from: "tests/browser/fixture/index.ts"
      to: "src/worker/index.ts"
      via: "import { L as WL } from '../../../src/worker/index'"
      pattern: "from.*src/worker"
---

<objective>
Create the rsbuild fixture entry point that exposes window.L and window.WL in the
browser page, remove the obsolete browser.test.ts file, and convert the rstest
browser project from a Playwright-executed browser project to a plain Node project
(same kind as node-console and node-tty).

Purpose: Lay the infrastructure foundation that Plans P02 and P03 depend on.
removes browser.enabled: true, removes pluginNodePolyfill from the browser project.
Output: fixture/index.ts (new), rstest.config.ts (modified), browser.test.ts (deleted).
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create browser fixture entry point</name>
  <files>tests/browser/fixture/index.ts</files>

  <read_first>
    - src/index.ts — verify the named export is `L` (not a default export)
    - src/worker/index.ts — verify the named export is `L` (re-exported as WL)
  </read_first>

  <action>
Create `tests/browser/fixture/index.ts` with the following exact content:

```typescript
import { L } from '../../../src/index';
import { L as WL } from '../../../src/worker/index';

/**
 * Browser fixture entry point served by the rsbuild dev server (port 7357).
 * Exposes both the main logger singleton and the worker logger proxy on window
 * so Playwright pages can interact with them via page.evaluate().
 */
(window as unknown as { L: typeof L; WL: typeof WL }).L = L;
(window as unknown as { L: typeof L; WL: typeof WL }).WL = WL;
```

This file is a browser entry point (bundled by rsbuild), NOT a test file.
It must NOT be included in tests/browser/**/*.test.ts or any test glob.
</action>

  <verify>
    <automated>
      grep -n "window.*\.L = L" tests/browser/fixture/index.ts
      grep -n "window.*\.WL = WL" tests/browser/fixture/index.ts
    </automated>
  </verify>

  <done>
    - File exists at tests/browser/fixture/index.ts
    - Contains import of L from src/index
    - Contains import of WL from src/worker/index
    - Assigns both to window via type assertion
  </done>

  <acceptance_criteria>
    - `grep "window.*\.L = L" tests/browser/fixture/index.ts` exits 0
    - `grep "window.*\.WL = WL" tests/browser/fixture/index.ts` exits 0
    - `grep "from.*src/index" tests/browser/fixture/index.ts` exits 0
    - `grep "from.*src/worker" tests/browser/fixture/index.ts` exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Convert browser rstest project to plain Node + delete browser.test.ts</name>
  <files>rstest.config.ts, tests/browser/browser.test.ts</files>

  <read_first>
    - rstest.config.ts — read the full file to understand all three projects before modifying
  </read_first>

  <action>
**Step A — Delete tests/browser/browser.test.ts:**
Run: `rm tests/browser/browser.test.ts`
This file contains CORE-07 (%c CSS format strings) and CORE-08 (groupCollapsed) tests
which are deferred per CONTEXT.md locked decision "Files to delete".

**Step B — Modify rstest.config.ts:**

Remove the `import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill'` line
(it will no longer be used in rstest.config.ts — it moves to index.test.ts in P03).

Replace the entire 'browser' project object from:
```typescript
{
  name: 'browser',
  extends: withRslibConfig({
    modifyLibConfig: (config) => ({
      ...config,
      // Polyfill Node built-ins required by ttyRenderer when bundling for Playwright.
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
```

With this plain Node project (no browser.enabled, no modifyLibConfig, no polyfill):
```typescript
{
  name: 'browser',
  extends: withRslibConfig(),
  include: ['tests/browser/**/*.test.ts'],
  setupFiles: ['./tests/common/reset.helper.ts'],
  disableConsoleIntercept: true,
  passWithNoTests: true,
},
```

The `disableConsoleIntercept: true` is required because the browser adapters use
`rs.spyOn(console, 'log').mockImplementation(() => {})` — same reason it is set on
the node-console project.

Do NOT remove the `import path from 'node:path'` line — it is still used by node-tty.
</action>

  <verify>
    <automated>
      [ ! -f tests/browser/browser.test.ts ] && echo "DELETED: browser.test.ts OK" || echo "FAIL: browser.test.ts still exists"
      grep -c "browser.enabled" rstest.config.ts | grep "^0$" && echo "OK: browser.enabled removed" || echo "FAIL: browser.enabled still present"
      grep -c "pluginNodePolyfill" rstest.config.ts | grep "^0$" && echo "OK: pluginNodePolyfill removed from rstest.config" || echo "FAIL: pluginNodePolyfill still in rstest.config"
      grep -n "disableConsoleIntercept" rstest.config.ts
    </automated>
  </verify>

  <done>
    - tests/browser/browser.test.ts does not exist
    - rstest.config.ts browser project has no browser.enabled key
    - rstest.config.ts browser project has no modifyLibConfig callback
    - rstest.config.ts does not import pluginNodePolyfill
    - rstest.config.ts browser project has disableConsoleIntercept: true
    - rstest.config.ts node-tty project is unchanged (still uses path.resolve)
  </done>

  <acceptance_criteria>
    - `[ ! -f tests/browser/browser.test.ts ]` exits 0
    - `grep -c "browser.enabled" rstest.config.ts` outputs `0`
    - `grep -c "pluginNodePolyfill" rstest.config.ts` outputs `0`
    - `grep "disableConsoleIntercept: true" rstest.config.ts` exits 0 and appears twice (browser + node-console)
    - `grep "node:path" rstest.config.ts` exits 0 (path import still present for node-tty)
    - `grep "provider.*playwright" rstest.config.ts` exits 1 (not present)
  </acceptance_criteria>
</task>

</tasks>

<verification>
After both tasks:
- [ ] `ls tests/browser/fixture/index.ts` succeeds
- [ ] `[ ! -f tests/browser/browser.test.ts ]` succeeds
- [ ] `grep "browser.enabled" rstest.config.ts` returns nothing
- [ ] `grep "pluginNodePolyfill" rstest.config.ts` returns nothing
- [ ] `grep "disableConsoleIntercept" rstest.config.ts` shows the line for the browser project
- [ ] `pnpm run test` runs without error on the browser project (passWithNoTests: true ensures it doesn't fail with empty test list)
</verification>

<success_criteria>
- Fixture entry point exists and correctly assigns to window
- rstest.config.ts browser project is a plain Node project (no browser.enabled, no polyfill, no modifyLibConfig)
- tests/browser/browser.test.ts deleted
- No TypeScript errors in rstest.config.ts following the changes
</success_criteria>

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-P01-SUMMARY.md`
</output>

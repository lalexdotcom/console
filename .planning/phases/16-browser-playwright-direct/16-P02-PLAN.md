---
phase: 16-browser-playwright-direct
plan: P02
type: execute
wave: 2
depends_on: [P01]
files_modified:
  - tests/browser/adapter.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "tests/browser/adapter.ts exports browserAdapter as a named const with name 'browser-main'"
    - "browserAdapter.capture() uses Node-side rs.spyOn on console.log/warn/error/debug/groupCollapsed"
    - "browserAdapter.logger returns the Node-side L singleton"
    - "tests/browser/adapter.ts exports createBrowserWorkerAdapter(ref) factory function"
    - "createBrowserWorkerAdapter returns adapter with name 'browser-worker'"
    - "browser-worker adapter capture() uses Node-side rs.spyOn (same mechanism as browser-main)"
    - "browser-worker adapter logger getter returns a Proxy routing calls to window.WL via page.evaluate"
  artifacts:
    - path: "tests/browser/adapter.ts"
      provides: "browserAdapter (main) + createBrowserWorkerAdapter factory (worker)"
      exports: ["browserAdapter", "createBrowserWorkerAdapter"]
  key_links:
    - from: "tests/browser/adapter.ts"
      to: "tests/common/adapter.ts"
      via: "implements TestAdapter interface"
      pattern: "TestAdapter"
    - from: "tests/browser/adapter.ts"
      to: "playwright"
      via: "import type { Page } from 'playwright'"
      pattern: "from.*playwright"
---

<objective>
Full rewrite of tests/browser/adapter.ts to produce two adapter implementations:

1. `browserAdapter` — Node-side spyOn capture, adapter.logger = Node-side L singleton.
   Functionally identical to the current implementation but documented for Option A.

2. `createBrowserWorkerAdapter(ref)` — factory function accepting a page reference
   object. Capture uses Node-side spyOn (for parity runs where common suite tests call
   Node-side L directly). The logger getter returns a Proxy that routes all method calls
   to window.WL in the Playwright page via page.evaluate.

Purpose: Both adapters start with 'browser' so spinners.suite.ts uses BROWSER_SPINNER_INTERVAL
and BROWSER_DEFAULT_RUNNING_ICON constants. The workerPageRef pattern decouples adapter
creation (module-level) from Playwright page availability (only after beforeAll).

Output: tests/browser/adapter.ts fully rewritten.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md

<interfaces>
<!-- Key contracts the executor needs — extracted from codebase -->

From tests/common/adapter.ts:
```typescript
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  readonly logger: RootLogger;
}
```

From tests/common/suites/spinners.suite.ts:
```typescript
// Name guard — adapter name MUST start with 'browser':
function getTickAdvance(adapter: TestAdapter): number {
  return adapter.name.startsWith('browser')
    ? BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10
    : CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10;
}
function getRunningIcon(adapter: TestAdapter): string {
  return adapter.name.startsWith('browser')
    ? BROWSER_DEFAULT_RUNNING_ICON.icon
    : '⋯';
}
```

From tests/browser/adapter.ts (current implementation to match):
```typescript
// Current capture() pattern to replicate:
const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
const debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
const groupSpy = rs.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
// ... in finally: restore all spies
// return [...logSpy.mock.calls...].filter(l => l.length > 0 && !/^\s+at /.test(l))
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite tests/browser/adapter.ts with both adapter implementations</name>
  <files>tests/browser/adapter.ts</files>

  <read_first>
    - tests/browser/adapter.ts — read current file IN FULL before rewriting
    - tests/common/adapter.ts — TestAdapter interface (must satisfy it exactly)
    - tests/common/suites/spinners.suite.ts — verify adapter.name startsWith('browser') guard
  </read_first>

  <action>
Replace the entire content of tests/browser/adapter.ts with:

```typescript
import { rs } from '@rstest/core';
import type { Page } from 'playwright';
import { L } from '../../src';
import type { RootLogger } from '../../src/types';
import type { TestAdapter } from '../common/adapter';

/**
 * Browser main adapter: Node-side rs.spyOn capture against the L singleton.
 *
 * Capture stays Node-side (not via page.evaluate) because common suite tests hold
 * live references to LoggerSpinner objects that page.evaluate cannot serialize.
 * Per Option A (hybrid capture) decided in Phase 16 RESEARCH.md.
 *
 * Name starts with 'browser' so spinners.suite uses BROWSER_SPINNER_INTERVAL
 * and BROWSER_DEFAULT_RUNNING_ICON constants instead of console equivalents.
 */
export const browserAdapter: TestAdapter = {
  name: 'browser-main',
  setup() {
    // reset.helper.ts handles registry reset globally via setupFiles.
    // Suite-level format (e.g. L.format = 'pretty') is applied by suite.setup().
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

/**
 * Factory for the browser worker adapter.
 *
 * Accepts a mutable reference object so the adapter can be created at module level
 * (before Playwright is ready) while the actual Page is filled in by beforeAll.
 * The ref.page field must be set before any test that accesses adapter.logger runs.
 *
 * Capture uses Node-side rs.spyOn — same mechanism as browserAdapter — so that common
 * suite parity runs (which call Node-side L directly, not adapter.logger) are captured
 * correctly. The parity run verifies constant selection under the 'browser-worker' name.
 *
 * The logger getter returns a Proxy routing all method calls to window.WL in the
 * Playwright page via page.evaluate. This supports explicit adapter.logger usage in
 * worker-specific tests. Return values from page.evaluate are Promise<unknown> and
 * should not be used by callers expecting synchronous non-serializable objects.
 *
 * @param ref - Mutable reference holding the Playwright Page B (workerPage).
 */
export function createBrowserWorkerAdapter(ref: {
  page: Page | null;
}): TestAdapter {
  return {
    name: 'browser-worker',
    setup() {
      // reset.helper.ts handles registry reset globally via setupFiles.
    },
    async capture(fn: () => void | Promise<void>): Promise<string[]> {
      // Node-side capture — common suite parity runs call Node-side L directly;
      // page.on('console') would capture nothing in those cases.
      const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = rs
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
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
      // Proxy routing all property accesses to window.WL in the browser page.
      // All calls return Promise<unknown> (page.evaluate is async) — callers must
      // not attempt to use synchronous return values like LoggerSpinner references.
      return new Proxy({} as RootLogger, {
        get(_, method: string) {
          return (...args: unknown[]) =>
            ref.page!.evaluate(
              ([m, a]) =>
                (
                  window as unknown as Record<
                    string,
                    (...x: unknown[]) => unknown
                  >
                ).WL[m](...a),
              [method, args] as [string, unknown[]],
            );
        },
      });
    },
  };
}
```

Key implementation notes:
- `browserAdapter` is identical in behavior to the existing implementation — no functional change
- `createBrowserWorkerAdapter` takes `{ page: Page | null }` not `Page` directly, enabling module-level creation before beforeAll runs
- Both adapter names start with 'browser' — required for spinners.suite constant selection
- The Proxy in logger getter accesses `ref.page!` at call time (not capture time), so the page must be set before any test that uses `adapter.logger`
</action>

  <verify>
    <automated>
      grep -n "export const browserAdapter" tests/browser/adapter.ts
      grep -n "export function createBrowserWorkerAdapter" tests/browser/adapter.ts
      grep -n "name: 'browser-main'" tests/browser/adapter.ts
      grep -n "name: 'browser-worker'" tests/browser/adapter.ts
      grep -n "page: Page | null" tests/browser/adapter.ts
      grep -n "ref.page!.evaluate" tests/browser/adapter.ts
    </automated>
  </verify>

  <done>
    - tests/browser/adapter.ts exports browserAdapter as named const
    - tests/browser/adapter.ts exports createBrowserWorkerAdapter as named function
    - browserAdapter.name === 'browser-main'
    - Worker adapter name === 'browser-worker'
    - createBrowserWorkerAdapter parameter type is { page: Page | null }
    - logger getter uses ref.page!.evaluate
    - capture() in both adapters uses rs.spyOn pattern (not page.on)
    - No TypeScript errors
  </done>

  <acceptance_criteria>
    - `grep "export const browserAdapter: TestAdapter" tests/browser/adapter.ts` exits 0
    - `grep "export function createBrowserWorkerAdapter" tests/browser/adapter.ts` exits 0
    - `grep "'browser-main'" tests/browser/adapter.ts` exits 0
    - `grep "'browser-worker'" tests/browser/adapter.ts` exits 0
    - `grep "page: Page | null" tests/browser/adapter.ts` exits 0
    - `grep "rs.spyOn(console, 'log')" tests/browser/adapter.ts` — appears TWICE (once per adapter)
    - `grep "page.on" tests/browser/adapter.ts` exits 1 (page.on NOT used in this file — capture is Node-side)
    - Running `pnpm exec tsc --noEmit` exits 0 (no TS errors introduced)
  </acceptance_criteria>
</task>

</tasks>

<verification>
After the task:
- [ ] `grep "export const browserAdapter" tests/browser/adapter.ts` succeeds
- [ ] `grep "export function createBrowserWorkerAdapter" tests/browser/adapter.ts` succeeds
- [ ] `grep "page.on" tests/browser/adapter.ts` returns nothing (Node-side spyOn only)
- [ ] `grep "ref.page!.evaluate" tests/browser/adapter.ts` succeeds
- [ ] No TypeScript compile errors from the rewrite
</verification>

<success_criteria>
- Both adapter exports present with correct names
- Capture mechanism is Node-side rs.spyOn for both adapters
- Worker adapter logger routes to window.WL via page.evaluate
- Page ref pattern allows module-level adapter creation
- File compiles cleanly under TypeScript strict mode
</success_criteria>

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-P02-SUMMARY.md`
</output>

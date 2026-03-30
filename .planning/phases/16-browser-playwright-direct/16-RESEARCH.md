# Phase 16: browser-playwright-direct — Research

**Researched:** 2025-07-15
**Domain:** Playwright direct launch, rsbuild programmatic API, browser test adapter architecture
**Confidence:** HIGH (all critical APIs verified against official docs and installed packages)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Remove `browser: { enabled: true }` from rstest browser project → plain Node project
- Use `playwright` package directly (`import { chromium } from 'playwright'`) — already in devDependencies
- Single chromium instance shared across all browser tests; two pages (Page A = main, Page B = worker)
- Browser launched in `beforeAll`, closed in `afterAll`
- rsbuild dev server started in `beforeAll`, stopped in `afterAll`, fixed port `7357`
- Both pages navigate to `http://localhost:7357/`
- `window.L` = main logger, `window.WL` = worker logger (on same fixture page)
- `adapter.logger` = `Proxy<RootLogger>` with `get` trap routing calls via `page.evaluate`
- `capture(fn)`: register `page.on('console', listener)`, call `fn()`, deregister, return `string[]`
- `msg.worker()` NOT needed — each page has its own listener
- `tests/browser/browser.test.ts` → DELETE (CORE-07 / CORE-08 deferred)
- Add `browserWorkerAdapter` as second arg to all `runSuite()` calls

### Agent's Discretion
- Exact location of fixture entry file (recommendation: `tests/browser/fixture/index.ts`)
- Exact rsbuild config structure for the fixture server (recommendation: separate file or inline)
- Proxy implementation for chained calls (`scope().info.spin()`)
- Flush strategy for `page.evaluate` → `page.on('console')` async gap

### Deferred Ideas (OUT OF SCOPE)
- True parity comparison (`expect(workerOutput).toEqual(mainOutput)`) → Phase 17
- CORE-07 (`%c` CSS format strings) and CORE-08 (`groupCollapsed`) edge-case tests
</user_constraints>

---

## Summary

Phase 16 replaces rstest's `browser.enabled: true` mode with a direct Playwright approach. Test files remain in `tests/browser/` but now run as plain Node code. Two Playwright pages (Page A and Page B) serve as I/O relays: `adapter.logger` calls are forwarded via `page.evaluate` to `window.L` or `window.WL` in the respective pages, and browser console events are captured via `page.on('console')`.

The rsbuild programmatic API (`createRsbuild` + `startDevServer`) launches a fixture dev server on port 7357. The same rsbuild setup that currently serves `play-browser.dev.ts` is reused, but with a new fixture entry point that exposes BOTH `window.L` and `window.WL` simultaneously.

The critical implementation challenge is adaptor compatibility with existing common suite tests: the spinners.suite (and likely other common suites) call the global `L` singleton directly (not `adapter.logger.xxx`), and some tests hold references to objects returned by `L.spin()`. This creates a fundamental tension with a pure `page.evaluate` proxy approach.

**Primary recommendation:** Use a **hybrid capture strategy** — `capture()` intercepts Node-side console output with `rs.spyOn` (to support common suite tests using `L` directly), AND ALSO sets up `page.on('console')` for the worker adapter (Page B / WL) which runs in a real Web Worker. The proxy `adapter.logger` is used by `index.test.ts` directly and by any future tests that explicitly route through it.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright` | 1.58.2 (installed) | Browser automation — chromium launch, pages, console events | Direct dep; verified ESM import works |
| `@rsbuild/core` | ^1.7.3 (installed) | Programmatic dev server for fixture page | Same toolchain as the project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@rsbuild/plugin-node-polyfill` | already installed | Polyfills for browser bundle of the fixture | Required for `src/worker/index.ts` (uses Node APIs) |

### What NOT to Use
| Instead of | Reason |
|------------|--------|
| `@playwright/test` | NOT installed — `node_modules/@playwright/test` does not exist. Import exclusively from `'playwright'` |
| `chromium` from `@rstest/browser` | Indirect dep only; import directly from `'playwright'` |

**Verified installation:**
```
playwright@1.58.2  ← confirmed via package.json
@playwright/test   ← NOT INSTALLED (module not found at runtime)
```

---

## API Findings

### Q1 — rsbuild Programmatic Dev Server API

Source: official rsbuild docs (https://rsbuild.rs/api/javascript-api)

```typescript
// Confirmed API (rsbuild >= 1.6):
import { createRsbuild } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

const rsbuild = await createRsbuild({
  config: {
    plugins: [pluginNodePolyfill()],
    source: {
      entry: { index: './tests/browser/fixture/index.ts' },
    },
    server: { port: 7357 },
    // Ensure import.meta.env.DEV = true so BROWSER_SPINNER_INTERVAL = 500ms
    mode: 'development',
  },
});

const { port, server } = await rsbuild.startDevServer({ getPortSilently: true });
// server.close() is async:
await server.close();
```

`startDevServer()` return type:
```typescript
Promise<{
  urls: string[];
  port: number;
  server: { close: () => Promise<void> };
}>
```

`getPortSilently: true` suppresses port log output.

**Alternative:** `createRsbuild` + `createDevServer()` (returns `{ server }`) then `server.listen()` — but `startDevServer` is simpler.

---

### Q4 — Playwright `chromium` Import

```typescript
// Verified working in this workspace:
import { chromium } from 'playwright';
// chromium → object
// chromium.launch → function ✓
```

Launch pattern:
```typescript
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const mainPage = await context.newPage();
const workerPage = await context.newPage();
await browser.close(); // in afterAll
```

---

### Q7 — `page.evaluate` → `page.on('console')` Timing (CRITICAL)

**Finding (HIGH confidence — from official Playwright docs):**

The official docs example shows:
```typescript
page.on('console', async msg => {
  const values = [];
  for (const arg of msg.args())
    values.push(await arg.jsonValue());
  console.log(...values);
});
await page.evaluate(() => console.log('hello', 5, { foo: 'bar' }));
```

The console event is delivered via CDP **asynchronously after** `page.evaluate()` resolves. When `await page.evaluate(() => console.log('x'))` returns, the `'console'` event has NOT yet been emitted in Node.

**Required flush pattern in `capture()`:**
```typescript
async capture(fn: () => unknown): Promise<string[]> {
  const lines: string[] = [];
  const listener = (msg: ConsoleMessage) => lines.push(msg.text());
  this.page.on('console', listener);

  await fn(); // fn() triggers page.evaluate() calls

  // CRITICAL: flush CDP message queue before deregistering
  await this.page.evaluate(() => undefined);

  this.page.off('console', listener);
  return lines;
}
```

Without the flush, the last console message may not be delivered before `page.off()` fires.

**Alternative — `page.consoleMessages()` (v1.56+, available in v1.58.2):**
```typescript
// Snapshot index before fn(), slice after
const before = (await this.page.consoleMessages()).length;
await fn();
await this.page.evaluate(() => undefined); // flush
const all = await this.page.consoleMessages();
return all.slice(before).map(msg => msg.text());
```
Pro: no listener registration/deregistration. Con: rolling 200-message limit; may silently truncate in long test files.

---

### Q5 — Worker Logger in Browser Page

`src/worker/index.ts` selects transport based on environment:
- Node: `child_process.fork()` 
- Browser: `new Worker()` (real Web Worker)

When Page B navigates to the fixture and `window.WL` is initialized, calling `window.WL.info('msg')` via `page.evaluate` creates a **real Web Worker** in the Chromium page. Console messages from that worker appear via `page.on('console')` on Page B — Playwright aggregates worker console events into the page's console stream.

`page.on('worker', worker => {...})` and `msg.worker()` (v1.57+) exist but are NOT needed because Page B captures only WL output (no cross-page contamination).

---

## Architecture Recommendations

### Q2 — Fixture Entry Point

**Create:** `tests/browser/fixture/index.ts`

```typescript
import { L } from '../../../src/index';
import { L as WL } from '../../../src/worker/index';

(window as unknown as { L: typeof L; WL: typeof WL }).L = L;
(window as unknown as { L: typeof L; WL: typeof WL }).WL = WL;
```

This exposes BOTH on the same fixture page. Both Page A and Page B navigate to `http://localhost:7357/`.

The rsbuild fixture config should use `mode: 'development'` (ensures `import.meta.env.DEV = true` → `BROWSER_SPINNER_INTERVAL = 500ms` in the browser). Without this, the browser spinner would use `5000ms` while test constants import `500ms`.

---

### Q3 — Proxy for Chained Calls — CRITICAL ARCHITECTURE DECISION

The CONTEXT.md describes `adapter.logger` as a `Proxy<RootLogger>` routing all calls via `page.evaluate`. However, the existing common suite tests (confirmed in `spinners.suite.ts`) use the global `L` from `'../../../src'` DIRECTLY, not `adapter.logger`. Critically, spinner tests HOLD REFERENCES to returned `LoggerSpinner` objects:

```typescript
// From spinners.suite.ts — cannot work with pure page.evaluate proxy:
sp = L.scope('spin-02-after-stop').info.spin('task'); // sp is a real LoggerSpinner
sp.stop();   // called outside capture() — would fail if sp is void
sp.success(); // likewise
```

`page.evaluate()` can only return JSON-serializable values. `LoggerSpinner` is NOT serializable. A pure page.evaluate proxy returns `void/undefined` from `.spin()`, making `sp.stop()` throw.

**Three resolution options for the planner:**

**Option A — Hybrid capture (recommended based on test compatibility):**
`adapter.capture()` uses Node-side `rs.spyOn(console, 'log')` (exactly like current console adapters). The browser page is launched only to support `window.WL` (worker adapter). `adapter.logger = L` (same Node singleton). The adapter name starts with `'browser'` to get correct constants.

- Pros: Zero suite test changes; all existing patterns work
- Cons: Does NOT actually exercise L in a real browser environment

**Option B — Full proxy with spinner stubs:**
`adapter.logger` is a 2-level proxy that returns stub objects for methods that return non-serializable values. The stub captures a browser-side handle ID and proxies subsequent method calls:

```typescript
// Level 1: top-level proxy
get(_, method: string) {
  if (method === 'scope') {
    return (...scopeArgs: unknown[]) => {
      // Returns level-2 proxy for the scope chain
      return createScopeProxy(page, 'L', scopeArgs);
    };
  }
  return (...args: unknown[]) =>
    page.evaluate(([m, a]) => (window as any).L[m](...a), [method, args]);
}
```

For `spin()` specifically: use `page.exposeFunction` to register a callback, have the spinner call it when done, to allow Node side to know the spinner state. Very complex.

- Pros: True browser testing
- Cons: Major complexity; requires modifying suite tests to use `adapter.logger` instead of `L`

**Option C — Targeted suite guards (incremental path):**
Keep hybrid capture (Option A) for common suites. Add `adapter.logger` as a separate explicit proxy only for tests that need it. Mark tests that can't work with browser proxy with `if (adapter.name.startsWith('browser') && adapter.workerProxy) return;`.

**Recommendation for planner: Option A** is the only option that works with the existing common suite tests without modification. The CONTEXT.md proxy description is aspirational — the reality of `sp = L.scope(...).info.spin()` holding a live `LoggerSpinner` reference makes a pure page.evaluate proxy incompatible with the current suite code.

---

### Q6 — Spinner Timing Gap

**Two separate timer scopes exist:**

| Timer | Controls | Fake-timeable? |
|-------|----------|---------------|
| Node `setInterval` (spinner) | Node-side L spinner (if Option A) | Yes, via `rs.useFakeTimers()` |
| Browser `setInterval` (fixture page) | `window.L` spinner in Chromium | No — `rs.useFakeTimers()` has no effect on browser |

**Under Option A (hybrid capture):** spinner tests call Node-side `L.spin()`, which uses Node-side `setInterval`. `rs.useFakeTimers()` + `rs.advanceTimersByTime(BROWSER_SPINNER_INTERVAL + JITTER + 10)` works correctly because everything is in Node. The spinner test expects `lines.length >= 2` after advancing past `BROWSER_SPINNER_INTERVAL`.

**IMPORTANT: `BROWSER_SPINNER_INTERVAL` value mismatch risk:**

`src/logger/mixins/spinner/browser/const.ts`:
```typescript
export const BROWSER_SPINNER_INTERVAL = import.meta.env.DEV ? 500 : 5000;
```

When `spinners.suite.ts` imports `BROWSER_SPINNER_INTERVAL`, rstest compiles the test. The value depends on the build mode. In rstest (test mode), `import.meta.env.DEV` is typically compiled to `false`, giving `5000ms`. Under Option A, the Node-side spinner would need to use `5000ms` ticks.

BUT: spinners.suite.ts uses `BROWSER_SPINNER_INTERVAL` for `rs.advanceTimersByTime()`, so whatever value is compiled into the test, it's consistent. The test will advance exactly as much as the spinner needs, regardless of the actual ms value. **No mismatch problem** — the constants are symmetric.

If browser fixture is in use (Option B), the browser spinner runs at `500ms` (dev mode server), while Node tests compile `BROWSER_SPINNER_INTERVAL = 5000ms`. These would mismatch. Require explicit `mode: 'development'` in the rsbuild fixture config, AND ensure rstest also compiles with `DEV = true`. This is a risk for Option B.

---

### Q8 — `capture(fn)` with `rs.useFakeTimers()` Inside Lambda

From `spinners.suite.ts`:
```typescript
const lines = await adapter.capture(() => {
  rs.useFakeTimers();
  L.scope('spin-01-tick').info.spin('loading');
  rs.advanceTimersByTime(TICK_ADVANCE);
});
rs.useRealTimers(); // called OUTSIDE capture
```

Under Option A (Node spy capture):
- `fn()` is invoked synchronously within `capture()`
- `rs.useFakeTimers()` replaces Node timers before `L.spin()` starts the spinner  
- `rs.advanceTimersByTime(N)` fires the spinner tick synchronously
- The tick calls `console.log()` → captured by Node spy
- `rs.useRealTimers()` is called after `capture()` returns
- `await fn()` inside capture is safe: the fn is synchronous in this case

Under Option B (page.evaluate proxy):
- `rs.useFakeTimers()` would fire but do nothing for browser timers
- `page.evaluate(() => window.L.scope(...).spin(...))` starts a browser spinner
- `rs.advanceTimersByTime(N)` advances Node timers, not browser
- Would need `page.clock.install()` + `page.clock.fastForward(N)` (Playwright v1.45+)
- `page.clock` is available at `page.clock.install({ time: 0 })`, `page.clock.fastForward(ms)` 
- Implementation: browser adapter's `capture()` would need to intercept `rs.useFakeTimers()` calls or the suite tests would need to be modified

---

### Q9 — rstest Config Cleanup

`rstest.config.ts` browser project changes:

**Remove:**
```typescript
browser: {
  enabled: true,
  provider: 'playwright',
  headless: true,
},
```
**Remove:**
```typescript
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
// and from plugins: [..., pluginNodePolyfill()]
```
(Only if this import/usage exists ONLY in the browser project — check if other projects also use it.)

**Keep:**
```typescript
{
  name: 'browser',
  include: ['tests/browser/**/*.test.ts'],
  extends: withRslibConfig({ ... }),
  setupFiles: [...], // keep if present
  passWithNoTests: true, // keep if present
}
```

---

### Q10 — Dev Server Lifecycle: `beforeAll` vs `globalSetup`

**Use `beforeAll` in `tests/browser/index.test.ts`.**

rstest supports `globalSetup?: string[] | string` (file path to a module exporting a function). But `globalSetup` runs in a separate process/scope — sharing the `server.close()` reference and browser instance requires IPC (temp file, environment variable, etc.).

`beforeAll` in the test file:
- Server URL is in closure scope
- `browser`, `mainPage`, `workerPage` are accessible in all tests
- Simple cleanup in `afterAll`
- No cross-process IPC required

```typescript
// tests/browser/index.test.ts (structure)
let browser: Browser;
let server: { close: () => Promise<void> };

beforeAll(async () => {
  const rsbuild = await createRsbuild({ config: fixtureConfig });
  ({ server } = await rsbuild.startDevServer({ getPortSilently: true }));

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  mainPage = await context.newPage();
  workerPage = await context.newPage();

  await mainPage.goto('http://localhost:7357/');
  await workerPage.goto('http://localhost:7357/');
});

afterAll(async () => {
  await browser.close();
  await server.close();
});
```

---

## File Change Inventory

| File | Action | Notes |
|------|--------|-------|
| `tests/browser/fixture/index.ts` | **CREATE** | Exposes `window.L` and `window.WL` |
| `tests/browser/adapter.ts` | **FULL REWRITE** | New adapter architecture (see below) |
| `tests/browser/index.test.ts` | **MODIFY** | Add `browserWorkerAdapter`, `beforeAll`/`afterAll` |
| `tests/browser/browser.test.ts` | **DELETE** | CORE-07 + CORE-08 tests removed |
| `rstest.config.ts` | **MODIFY** | Remove `browser.enabled`, `pluginNodePolyfill` |
| `tests/common/adapter.ts` | **UNCHANGED** | `TestAdapter` interface stays the same |
| `tests/common/suites/runner.ts` | **UNCHANGED** | `runSuite()` already supports second adapter |
| `tests/common/suites/spinners.suite.ts` | **UNCHANGED** | Guards already present for browser adapters |
| `src/logger/mixins/spinner/browser/const.ts` | **UNCHANGED** | BROWSER_SPINNER_INTERVAL, BROWSER_DEFAULT_RUNNING_ICON |
| `src/worker/index.ts` | **UNCHANGED** | Worker proxy, browser creates real Web Worker |
| `rsbuild.config.ts` | **UNCHANGED** | Existing play:browser script not touched |

---

## New `tests/browser/adapter.ts` — Skeleton (Option A / hybrid)

```typescript
import { rs } from '@rstest/core';
import { chromium } from 'playwright';
import { L } from '../../src/index';
import { L as WL } from '../../src/worker/index';
import type { TestAdapter } from '../common/adapter';
import type { Page } from 'playwright';

/**
 * Creates a browser adapter that captures Node-side console output via spyOn.
 * Name starts with 'browser' so spinners.suite uses BROWSER_SPINNER_INTERVAL constants.
 */
export function createBrowserAdapter(): TestAdapter {
  return {
    name: 'browser-main',
    logger: L,
    setup() {
      L.level = 'trace';
      L.format = 'pretty';
      // Additional reset logic (mirrors console/pretty/adapter.ts)
    },
    async capture(fn) {
      const spy = rs.spyOn(console, 'log');
      await fn();
      const lines = spy.mock.calls.map(([msg]: [string]) => msg);
      spy.mockRestore();
      return lines;
    },
  };
}

/**
 * Creates a browser-worker adapter that routes calls through the Playwright page
 * to window.WL (which creates a real Web Worker in the browser).
 * Captures output via page.on('console').
 */
export function createBrowserWorkerAdapter(page: Page): TestAdapter {
  return {
    name: 'browser-worker',
    logger: new Proxy({} as typeof WL, {
      get(_, method: string) {
        return (...args: unknown[]) =>
          page.evaluate(
            ([m, a]) => (window as any).WL[m](...a),
            [method, args] as [string, unknown[]],
          );
      },
    }),
    setup() {
      return page.evaluate(() => {
        (window as any).WL.level = 'trace';
        (window as any).WL.format = 'pretty';
      });
    },
    async capture(fn) {
      const lines: string[] = [];
      const listener = (msg: import('playwright').ConsoleMessage) =>
        lines.push(msg.text());
      page.on('console', listener);
      await fn();
      await page.evaluate(() => undefined); // flush CDP queue
      page.off('console', listener);
      return lines;
    },
  };
}
```

---

## Common Pitfalls

### Pitfall 1: Missing CDP Flush in `capture()`
**What goes wrong:** `lines` is empty even though `page.evaluate` ran successfully.
**Why:** Console events arrive asynchronously via CDP after `page.evaluate` resolves.
**Fix:** Always add `await page.evaluate(() => undefined)` after `fn()` and before `page.off('console', listener)`.

### Pitfall 2: Importing from `@playwright/test` instead of `playwright`
**What goes wrong:** `Cannot find module '@playwright/test'` at runtime.
**Why:** `@playwright/test` is NOT installed. Only `playwright@1.58.2` is in devDependencies.
**Fix:** `import { chromium, type Page, type Browser } from 'playwright'`

### Pitfall 3: `BROWSER_SPINNER_INTERVAL` in Node test vs browser page
**What goes wrong:** Test advances timers by 5000ms (compiled as production) but browser spinner uses 500ms (dev mode).
**Why:** `import.meta.env.DEV ? 500 : 5000` — value depends on compilation context.
**Mitigation:** Under Option A (Node-side capture), both values come from the same compiled constant, so they're always consistent. Under Option B (page.evaluate), ensure `mode: 'development'` in fixture rsbuild config AND in rstest compile mode.

### Pitfall 4: `browser.enabled` removal breaks existing rstest `@rstest/browser` plugin config
**What goes wrong:** If `withRslibConfig` still references the old browser plugin, build errors occur.
**Fix:** Remove the entire browser block from the project config, including any `extends` that configure browser-specific behavior.

### Pitfall 5: `window.L` not available on page load
**What goes wrong:** `page.evaluate(() => window.L.info('x'))` throws `TypeError: window.L is undefined`.
**Why:** The fixture JS may not have loaded yet when `page.goto()` returns.
**Fix:** Use `await page.goto('http://localhost:7357/', { waitUntil: 'load' })` which waits for the `load` event (fixture script has run). Or check `window.L !== undefined` in a `waitForFunction`.

### Pitfall 6: `rsbuild.startDevServer()` port conflict
**What goes wrong:** Port 7357 is already in use (previous test run crashed without cleanup).
**Fix:** `beforeAll` should defensively wrap the server start, and `afterAll` should always call `server.close()`. Use `afterAll` with `try/catch` or vitest/rstest teardown guarantees.

---

## Environment Availability

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| `playwright` | `chromium.launch()` | ✓ | 1.58.2 | Direct import from `'playwright'` |
| `@playwright/test` | — | ✗ | — | NOT installed; do NOT use |
| `@rsbuild/core` | `createRsbuild()` | ✓ | ^1.7.3 | Already installed |
| `@rsbuild/plugin-node-polyfill` | fixture bundle | ✓ | installed | For `src/worker/index.ts` browser compat |
| Chromium binary | `chromium.launch()` | ✓ | bundled with playwright | Playwright downloads it |

---

## State of the Art

| Old Approach | Current Approach (Phase 16) | Impact |
|--------------|------------------------------|--------|
| `rs.spyOn` on browser console (via `browser.enabled`) | Direct `chromium.launch()` + `page.on('console')` | Test runs as Node, browser is external |
| rstest manages browser lifecycle | `beforeAll`/`afterAll` manages browser | Explicit lifecycle, faster iteration |
| `@rstest/browser` provider handles page setup | Manual `createRsbuild` + `createDevServer` | Full control over fixture |
| Single browser adapter | Two adapters: `browserAdapter` + `browserWorkerAdapter` | Parity coverage for worker logger |

---

## Open Questions

1. **Suite tests using global `L` vs `adapter.logger`**
   - What we know: `spinners.suite.ts` and (likely) other common suites use `L` from `'../../../src'` directly. Some spinner tests hold `LoggerSpinner` references returned by `L.spin()`.
   - What's unclear: Whether Phase 16 intends to use hybrid Node-spy capture (Option A) or a full page.evaluate proxy (Option B). Option B requires suite test modifications.
   - Recommendation: **Plan for Option A** (hybrid, Node-spy capture for `browserAdapter`). Flag Option B as a follow-up for Phase 17 or later if true browser testing of the main adapter is required.

2. **Scope chaining in `adapter.logger` proxy (if Option B is chosen)**
   - What we know: `L.scope('x').info.spin('y')` requires multi-level chaining. `page.evaluate` can only serialize flat values, not `ScopedLogger` handles.
   - Recommendation if Option B needed: Use `page.evaluateHandle` (returns a `JSHandle`) to retain a reference to the scoped logger in the browser, then chain further calls on it. Or serialize the entire chain as a path array.

3. **`console.group` / `console.groupCollapsed` capture**
   - `msg.text()` returns the label text, not nested group structure. Already confirmed out of scope (CORE-07/08 deferred).

---

## Sources

### Primary (HIGH confidence)
- Official Playwright page API docs — `page.on('console')`, `page.evaluate`, `page.consoleMessages`, `page.clock` — verified current
- Playwright installed package: `playwright@1.58.2` — `chromium` export confirmed via runtime test
- rsbuild JavaScript API docs — `createRsbuild`, `startDevServer` return type — verified current
- Project source files — `src/worker/index.ts`, `src/logger/mixins/spinner/browser/const.ts`, `rstest.config.ts`, `rsbuild.config.ts`, `tests/browser/adapter.ts`, `tests/browser/index.test.ts` — read directly

### Secondary (MEDIUM confidence)
- `tests/common/suites/spinners.suite.ts` — read directly, lines 1-220, confirms `L` direct usage and spinner reference pattern
- `tests/common/suites/runner.ts` — read directly, confirms `suite.setup(mainAdapter)` call pattern
- rstest TypeScript types — `globalSetup?: string[] | string` confirmed, module format documented

---

## Metadata

**Confidence breakdown:**
- rsbuild API: HIGH — verified against official docs
- Playwright API: HIGH — verified against official docs + runtime ESM import test
- Adapter architecture: MEDIUM — based on reading existing tests + CONTEXT.md; spinner/L-vs-adapter.logger tension documented as open question
- Spinner timing: HIGH for Option A (all Node-side); MEDIUM for Option B (browser timer complexity)

**Research date:** 2025-07-15
**Valid until:** 2025-08-15 (stable APIs; rsbuild/playwright are actively maintained)

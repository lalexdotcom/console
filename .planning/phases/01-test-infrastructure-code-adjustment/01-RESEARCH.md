# Phase 1: Test Infrastructure & Code Adjustment - Research

**Researched:** 2026-03-24
**Domain:** Test framework setup (rstest + Playwright), test helpers, code adjustment
**Confidence:** HIGH

## Summary

This phase bootstraps the entire test infrastructure for `@lalex/console` from zero. The project currently has no test framework, test files, test scripts, or coverage tooling. The stack is rstest (the Rspack-native test runner) with `@rstest/adapter-rslib` for build-config reuse, and rstest Browser Mode with Playwright for browser tests.

The key complexity lies in (1) configuring rstest's `projects` to run both Node and browser tests from a single `pnpm test`, (2) building a `beforeEach` setup file that resets the `globalThis['$logger-registry']` singleton between tests without breaking the logger's internal closures, and (3) disabling rstest's own console interception since this library deliberately patches/unpatches `console` methods.

**Primary recommendation:** Use a single `rstest.config.ts` with two inline projects (node + browser), `@rstest/adapter-rslib` to reuse the Rslib build config, a setup file for singleton reset, and `disableConsoleIntercept: true` on the node project.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tests live in a dedicated `tests/` directory at project root (not co-located in `src/`).
- **D-02:** Tests are grouped by runtime environment and mode:
  ```
  tests/
    helpers/        (shared utilities)
    browser/
      main/         (browser main thread)
      worker/       (browser web worker)
    node/
      main/         (Node console mode)
      worker/       (Node fork worker)
    tty/
      main/         (TTY main thread)
      worker/       (TTY worker)
  ```
- **D-03:** One file per concern in `tests/helpers/` — e.g. `stdout.ts`, `console-spy.ts`, `reset.ts`. Each helper is independent with targeted imports.
- **D-04:** Helpers use a functional wrapper pattern — e.g. `captureStdout(() => { ... })` returns captured output. No shared mutable state, composable.
- **D-05:** Chromium only (headless) via Playwright — sufficient to validate `console.log`/`%c` CSS, `groupCollapsed`, etc.
- **D-06:** Console method spying for browser assertions — intercept `console.log`/`warn`/`error` calls in the headless browser context to verify arguments (`%c`, CSS strings, `groupCollapsed` usage).
- **D-07:** Automatic fixture via `beforeEach` — rstest hook that resets the singleton registry before each test. No manual reset calls needed in individual tests.

### Agent's Discretion
- Reset depth (registry only vs. registry + state + scopes + console patch) — agent determines the appropriate level based on what the singleton exposes.

### Deferred Ideas (OUT OF SCOPE)
None.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADJ-01 | `error` and `warn` levels produce call-site trace in browser mode (add to TRACE_LEVELS) | Direct Set mutation in `src/levels.ts` line 39; add `'error'` and `'warn'` to the Set constructor |
| INFRA-01 | rstest configured with TypeScript ESM support via `@rstest/adapter-rslib` | `@rstest/adapter-rslib` 0.2.1 + `@rstest/core` 0.9.4; `withRslibConfig()` in rstest.config.ts |
| INFRA-02 | Shared test helpers for stdout capture (Node console mode) | Functional wrapper in `tests/helpers/stdout.ts`; intercept `process.stdout.write` |
| INFRA-03 | Shared test helpers for console spy capture (browser mode) | Functional wrapper in `tests/helpers/console-spy.ts`; spy on `console.*` methods |
| INFRA-04 | Singleton registry reset utility for test isolation | Setup file with `beforeEach` targeting `globalThis['$logger-registry']`; must recreate root logger |
| INFRA-05 | rstest browser mode configured with Playwright for browser tests | `@rstest/browser` package + `browser: { enabled: true, provider: 'playwright', headless: true }` in browser project |
| INFRA-06 | Test scripts added to package.json (`test`, `test:browser`, `test:node`) | `rstest` / `rstest --project node` / `rstest --project browser` |

</phase_requirements>

## Project Constraints (from copilot-instructions.md)

- **Zero runtime dependencies** — devDependencies only for test packages
- **No version changes** — never modify version in package.json or create git tags
- **TypeScript strict mode** — no `any`, named exports only, `interface` over `type` for object shapes
- **English only** for all code, comments, documentation
- **Biome** for linting (`pnpm run check`) and formatting (`pnpm run format`)
- **`as const` + `satisfies`** for typed constants
- **`import type`** for type-only imports
- **Named exports only** — no default exports

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@rstest/core` | 0.9.4 | Test runner, assertions, hooks, CLI | Rspack-native test runner; official recommendation for Rslib projects |
| `@rstest/adapter-rslib` | 0.2.1 | Reuses `rslib.config.ts` build config for tests | Eliminates config duplication; maps source.define, source.exclude, resolve, tools.rspack |
| `@rstest/browser` | (matches @rstest/core) | Browser Mode — runs tests in real Chromium via Playwright | Required for browser-specific console output validation (D-05, D-06) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `playwright` | (peer of @rstest/browser) | Browser driver for rstest Browser Mode | Installed via `npx playwright install chromium`; only chromium needed (D-05) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rstest | vitest | vitest is more mature but rstest is the Rslib-native choice and the Rslib skill recommends it |
| Playwright browser mode | happy-dom/jsdom | Can't validate real `console.groupCollapsed`, `%c` CSS, or Web Worker APIs |

**Installation:**
```bash
pnpm add -D @rstest/core @rstest/adapter-rslib @rstest/browser
npx playwright install chromium
```

**Version verification:** Versions confirmed via `npm view` on 2026-03-24:
- `@rstest/core`: 0.9.4
- `@rstest/adapter-rslib`: 0.2.1
- `@playwright/test`: 1.58.2 (playwright: 1.58.2)

**Dependency note:** `@rstest/core` 0.9.4 bundles its own `@rsbuild/core@2.0.0-beta.9` as a dependency (not a peer). The project's `@rsbuild/core@^1.7.3` remains untouched. `@rstest/adapter-rslib` declares `@rslib/core: '>=0.18.6'` as a peer — compatible with the project's `@rslib/core@^0.20.0`.

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── helpers/
│   ├── stdout.ts          # captureStdout(() => ...) — Node stdout interception
│   ├── console-spy.ts     # spyOnConsole(() => ...) — browser console capture
│   └── reset.ts           # resetLoggerRegistry() — singleton cleanup
├── browser/
│   ├── main/              # browser main-thread tests
│   └── worker/            # browser web-worker tests
├── node/
│   ├── main/              # Node console-mode tests
│   └── worker/            # Node fork-worker tests
└── tty/
    ├── main/              # TTY main-thread tests
    └── worker/            # TTY worker tests
rstest.config.ts           # Root config with projects: [node, browser]
```

### Pattern 1: Dual-project rstest config with adapter
**What:** Single `rstest.config.ts` at project root defines two inline projects — `node` and `browser` — each extending the Rslib config via `withRslibConfig()`.
**When to use:** Always — this is the main config pattern.
**Example:**
```typescript
// Source: https://rstest.rs/guide/integration/rslib + https://rstest.rs/config/test/browser
import { defineConfig } from '@rstest/core';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default defineConfig({
  projects: [
    {
      name: 'node',
      extends: withRslibConfig(),
      include: [
        'tests/node/**/*.test.ts',
        'tests/tty/**/*.test.ts',
      ],
      setupFiles: ['./tests/helpers/reset.ts'],
      disableConsoleIntercept: true,
      passWithNoTests: true,
    },
    {
      name: 'browser',
      extends: withRslibConfig(),
      include: ['tests/browser/**/*.test.ts'],
      setupFiles: ['./tests/helpers/reset.ts'],
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

### Pattern 2: Setup file with beforeEach for singleton reset
**What:** A setup file referenced via `setupFiles` that runs `beforeEach` to reset the logger registry.
**When to use:** Every test project — ensures test isolation (D-07).
**Example:**
```typescript
// tests/helpers/reset.ts
// Source: codebase analysis of src/logger/index.ts
import { beforeEach } from '@rstest/core';

const REGISTRY_KEY = '$logger-registry';

/**
 * Resets the logger singleton registry before each test.
 * Removes the globalThis entry entirely so the logger module re-bootstraps
 * a fresh root logger on next import/access.
 */
beforeEach(() => {
  const anyGlobal = globalThis as Record<string, unknown>;
  delete anyGlobal[REGISTRY_KEY];
});
```

### Pattern 3: Functional wrapper helpers (D-04)
**What:** Each helper wraps a callback, captures output, and returns it.
**When to use:** All test assertions that need to capture console/stdout output.
**Example:**
```typescript
// tests/helpers/stdout.ts
/**
 * Captures all process.stdout.write calls during the callback execution.
 * Returns an array of written strings.
 */
export function captureStdout(fn: () => void): string[] {
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks;
}
```

### Anti-Patterns to Avoid
- **Shared mutable spy state across tests:** Don't create a global spy that accumulates calls. Each helper must capture and return fresh state per invocation.
- **Not disabling rstest console interception:** rstest intercepts `console.*` by default to track log sources. Since this library patches console methods, rstest's interception will conflict. Always set `disableConsoleIntercept: true` for the node project.
- **Deleting the registry without re-importing the logger:** After deleting `globalThis['$logger-registry']`, the existing `Logger` export still holds the old reference. Tests of the singleton behavior (REG-01, REG-02 in Phase 2) will need dynamic imports. For this phase, the setup file just clears the registry; the factory function re-creates when needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser test execution | Custom Puppeteer/Playwright wrapper | rstest Browser Mode (`@rstest/browser`) | Handles build, serve, browser lifecycle, assertions with auto-wait |
| Test isolation | Custom module cache clearing | rstest `setupFiles` + `beforeEach` | Framework-supported, runs before each test file automatically |
| Assertion library | Custom matchers | rstest built-in `expect` (Chai-based) | Full matcher set: `toBe`, `toEqual`, `toContain`, `toHaveLength`, etc. |
| Mock functions | Manual call tracking | `rstest.fn()` / `rstest.spyOn()` (tinyspy) | Automatic mock tracking, `.toHaveBeenCalled()` matchers |

**Key insight:** rstest bundles assertions (Chai), mocking (tinyspy), and browser testing (Playwright) — no need for external assertion or mocking libraries.

## Common Pitfalls

### Pitfall 1: rstest console interception conflicts with logger's console patching
**What goes wrong:** The logger's `patch()` method replaces `console.log/info/debug/warn/error` with logger methods. rstest also intercepts console by default. Double interception causes infinite loops or silent swallowing.
**Why it happens:** rstest wraps console methods to track log sources; the logger also wraps them.
**How to avoid:** Set `disableConsoleIntercept: true` in the node project config.
**Warning signs:** Tests hang, produce no output, or show "Maximum call stack size exceeded."

### Pitfall 2: Singleton registry not fully cleared between tests
**What goes wrong:** Logger scope cache persists, exclusive lock leaks, format setting carries over, `rootOptions` reference is stale.
**Why it happens:** The registry object on `globalThis['$logger-registry']` contains `root`, `rootOptions`, `scopes`, `exclusive`, and `format`. Partially clearing it leaves dangling state.
**How to avoid:** Delete the entire key from `globalThis` rather than selectively clearing properties. This forces the module's IIFE to re-create a fresh registry on next access. However, note that the `registry` const inside the module is captured by closure — for full isolation, tests may need dynamic `import()` or rstest's module-level isolation.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 3: Forgetting `passWithNoTests: true` in initial setup
**What goes wrong:** `pnpm test` fails with "no test suites found" because this phase creates infrastructure but no feature tests.
**Why it happens:** rstest defaults to `passWithNoTests: false`.
**How to avoid:** Add `passWithNoTests: true` to both project configs. A smoke test in each project (e.g., `tests/node/main/smoke.test.ts`) guarantees the framework works.

### Pitfall 4: TRACE_LEVELS change requires verifying browser groupCollapsed behavior  
**What goes wrong:** Adding `error` and `warn` to `TRACE_LEVELS` changes browser output to use `console.groupCollapsed` for these levels. If the existing code in `emitConsole` handles this correctly, no code change is needed beyond the Set addition. But if not tested, it could break DevTools output.
**Why it happens:** `emitConsole` checks `TRACE_LEVELS.has(logLevel)` to decide whether to wrap output in `groupCollapsed`. Adding new members changes the control flow for `error` and `warn`.
**How to avoid:** The code in `emitConsole` already handles the `hasTrace` path correctly (lines ~380-395 in `src/logger/index.ts`). The only required change is in `src/levels.ts` line 39: add `'error'` and `'warn'` to the Set. Write a smoke test in the browser project verifying `groupCollapsed` is called for `error` level.

### Pitfall 5: @rstest/adapter-rslib maps output.target to testEnvironment
**What goes wrong:** The Rslib config has `syntax: ['node 18']` in the main lib entry. The adapter may map this to `testEnvironment: 'node'`, which is correct for the node project but wrong for the browser project.
**Why it happens:** `@rstest/adapter-rslib` maps `output.target` → `testEnvironment`. The Rslib config doesn't explicitly set `output.target` but defaults based on `syntax`.
**How to avoid:** The browser project's `browser.enabled: true` overrides `testEnvironment`. This should work correctly but verify with `DEBUG=rstest` if issues arise.

## Code Examples

Verified patterns from official sources and codebase analysis:

### ADJ-01: Adding error and warn to TRACE_LEVELS
```typescript
// Source: src/levels.ts line 39
// Before:
export const TRACE_LEVELS = new Set<LogLevel>(['emerg', 'alert', 'crit']);

// After:
export const TRACE_LEVELS = new Set<LogLevel>(['emerg', 'alert', 'crit', 'error', 'warn']);
```

### Singleton Registry Structure (reset target)
```typescript
// Source: src/logger/index.ts lines 32-45
// The registry object that must be reset between tests:
type LoggerRegistry = {
  root: RootLogger;
  rootOptions: Partial<LoggerOptions>;
  scopes: { [key: string]: ScopeLogger | undefined };
  exclusive?: RootLogger | ScopeLogger;
  format: 'pretty' | 'json' | 'logfmt';
};

// Registry key on globalThis:
const registryName = '$logger-registry';

// Reset approach: delete globalThis[registryName] entirely
```

### Browser Console Spy Helper
```typescript
// Source: project requirement D-06
// tests/helpers/console-spy.ts
type ConsoleCall = {
  method: string;
  args: unknown[];
};

/**
 * Spies on console methods during callback execution.
 * Returns an array of { method, args } for each captured call.
 */
export function spyOnConsole(fn: () => void): ConsoleCall[] {
  const calls: ConsoleCall[] = [];
  const methods = ['log', 'info', 'debug', 'warn', 'error', 'groupCollapsed', 'groupEnd'] as const;
  const originals = Object.fromEntries(
    methods.map((m) => [m, console[m]])
  );

  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      calls.push({ method, args });
    };
  }

  try {
    fn();
  } finally {
    for (const method of methods) {
      console[method] = originals[method];
    }
  }

  return calls;
}
```

### Smoke test (Node project)
```typescript
// tests/node/main/smoke.test.ts
import { expect, test } from '@rstest/core';

test('rstest runs in node environment', () => {
  expect(1 + 1).toBe(2);
});
```

### Smoke test (Browser project)
```typescript
// tests/browser/main/smoke.test.ts
import { expect, test } from '@rstest/core';

test('rstest runs in browser environment', () => {
  expect(typeof document).toBe('object');
  expect(typeof window).toBe('object');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vitest for Rslib projects | rstest with @rstest/adapter-rslib | rstest 0.7+ (2025) | Native Rspack integration, shared config |
| jsdom/happy-dom for browser tests | rstest Browser Mode with Playwright | rstest 0.9+ (2026) | Real browser APIs, `console.groupCollapsed` support |
| Separate test configs per environment | rstest `projects` with inline config | rstest 0.8+ | Single config file, single CLI command |

## Open Questions

1. **Registry closure capture vs. delete-and-reimport**
   - What we know: The `registry` const inside `src/logger/index.ts` is captured by closure in the IIFE. Deleting `globalThis['$logger-registry']` means the IIFE won't re-run on re-import (module already cached). The exported `Logger` / `L` still reference the old registry.
   - What's unclear: Whether rstest's module isolation (`isolate: true` by default) creates a fresh module scope per test file, making the delete-from-globalThis approach work file-by-file.
   - Recommendation: For Phase 1, implement the simplest reset (delete `globalThis['$logger-registry']`). If per-test isolation is insufficient, escalate to a deeper reset in the setup file that reconstructs the registry object in place (clearing `scopes`, `exclusive`, resetting `format`, and calling `createLogger()` to replace `root` and `rootOptions`). This is the "agent's discretion" area from CONTEXT.md.

2. **@rstest/browser packaging and compatibility**
   - What we know: `@rstest/browser` is listed in rstest docs but its npm version wasn't directly confirmed. It should match `@rstest/core`.
   - What's unclear: Exact peer dependency requirements.
   - Recommendation: Install with `pnpm add -D @rstest/browser` and verify. If the package doesn't exist as standalone, browser support may be bundled in `@rstest/core` (check after install).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | 22.16.0 | — |
| pnpm | Package management | ✓ | 10.11.0 | — |
| Chromium (Playwright) | Browser tests | ✗ (needs install) | — | `npx playwright install chromium` |
| @rstest/core | Test runner | ✗ (needs install) | 0.9.4 on npm | — |
| @rstest/adapter-rslib | Config reuse | ✗ (needs install) | 0.2.1 on npm | — |
| @rstest/browser | Browser Mode | ✗ (needs install) | on npm | — |

**Missing dependencies with no fallback:**
- All test packages must be installed: `@rstest/core`, `@rstest/adapter-rslib`, `@rstest/browser`
- Playwright Chromium browser must be installed: `npx playwright install chromium`

**Missing dependencies with fallback:**
- None — all dependencies are required.

## Sources

### Primary (HIGH confidence)
- rstest.rs/guide/integration/rslib — Rslib adapter configuration, `withRslibConfig()` API
- rstest.rs/guide/browser-testing/getting-started — Browser Mode manual setup, Playwright install
- rstest.rs/config/test/browser — Browser config options (`enabled`, `provider`, `headless`)
- rstest.rs/config/test/setup-files — `setupFiles` configuration
- rstest.rs/config/test/disable-console-intercept — `disableConsoleIntercept` option
- rstest.rs/config/test/pass-with-no-tests — `passWithNoTests` option
- rstest.rs/guide/basic/projects — Multi-project configuration, inline projects
- rstest.rs/api/runtime-api/test-api/hooks — `beforeEach`, `beforeAll` hook API
- npm registry — version verification for all packages

### Secondary (MEDIUM confidence)
- Codebase analysis of `src/logger/index.ts` — registry structure, singleton bootstrap, console patching
- Codebase analysis of `src/levels.ts` — TRACE_LEVELS Set definition

### Tertiary (LOW confidence)
- None — all findings verified against official sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via npm registry and official rstest docs
- Architecture: HIGH — follows official rstest patterns (projects, adapter, browser mode)
- Pitfalls: HIGH — identified from codebase analysis and rstest documentation
- ADJ-01 change: HIGH — single-line Set modification, verified code path in emitConsole

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (rstest is fast-moving; re-verify adapter compatibility on version bumps)

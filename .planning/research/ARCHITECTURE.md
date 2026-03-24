# Architecture Research

**Domain:** Multi-environment test suite for a TypeScript logger library
**Researched:** 2026-03-24
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     rstest.config.ts (root)                         │
│                  3 projects via `projects` field                     │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│   Project: node     │  Project: browser   │   Project: tty          │
│   env: node         │  env: browser       │   env: node             │
│   tests/node/**     │  tests/browser/**   │   tests/tty/**          │
│   LLOGER_FORCE_     │  @rstest/browser    │   isNodeTTY=true        │
│   CONSOLE=true      │  + Playwright       │   process.stdout.isTTY  │
├─────────────────────┼─────────────────────┼─────────────────────────┤
│  Output capture:    │  Output capture:    │  Output capture:        │
│  rstest.spyOn       │  rstest.spyOn       │  process.stdout.write   │
│  (process.stdout)   │  (console,*)        │  intercept → ANSI       │
│                     │                     │  snapshot files          │
├─────────────────────┴─────────────────────┴─────────────────────────┤
│                    tests/helpers/ (shared)                           │
│  registry-reset.ts │ console-capture.ts │ fixtures.ts │ ansi.ts     │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Root config (`rstest.config.ts`) | Defines 3 projects, global settings, Rslib adapter | `@rstest/adapter-rslib` + inline project configs |
| Node project | Tests console/CI output (json, logfmt, pretty) | `LLOGER_FORCE_CONSOLE=true`, stdout write interception |
| Browser project | Tests browser devtools output (CSS `%c`, groupCollapsed) | `@rstest/browser` + Playwright, console spy |
| TTY project | Tests interactive terminal output (cursor, ANSI, spinners) | Real stdout with mock isTTY, file snapshots for ANSI |
| Shared helpers | Registry reset, output capture, common fixtures | `tests/helpers/` imported by all projects |

## Recommended Test Directory Structure

```
tests/
├── helpers/                          # Shared test utilities (all projects)
│   ├── registry-reset.ts             # Reset globalThis logger registry between tests
│   ├── console-capture.ts            # Spy-based console.* capture (browser + node)
│   ├── stdout-capture.ts             # process.stdout.write intercept (node + tty)
│   ├── ansi.ts                       # Strip/normalize ANSI codes for assertions
│   └── fixtures.ts                   # Shared log message fixtures, option presets
├── node/                             # Console mode — json, logfmt, pretty
│   ├── setup.ts                      # Set LLOGER_FORCE_CONSOLE=true, disable console intercept
│   ├── levels.test.ts                # All 11 levels emit correct output
│   ├── level-filtering.test.ts       # Level gating (set level=warn → info suppressed)
│   ├── format-json.test.ts           # JSON serialization output
│   ├── format-logfmt.test.ts         # Logfmt serialization output
│   ├── format-pretty.test.ts         # Pretty console rendering
│   ├── prefix/
│   │   ├── date.test.ts              # Date prefix rendering
│   │   ├── caller.test.ts            # Call-site prefix (stack capture)
│   │   ├── scope.test.ts             # Scope prefix & nested scopes
│   │   └── serialize.test.ts         # serializeJSON / serializeLogfmt
│   ├── mixins/
│   │   ├── limit.test.ts             # once(), limit() rate limiting
│   │   ├── override.test.ts          # .options() one-shot overrides
│   │   └── spinner.test.ts           # Console spinner (non-TTY: icon badges, text progress)
│   ├── singleton.test.ts             # Registry dedup, cross-module singleton
│   ├── scope.test.ts                 # Scope creation, option inheritance, caching
│   ├── options.test.ts               # computeOptions cascading, level strictness
│   └── worker/
│       ├── proxy.test.ts             # Worker proxy message serialization
│       └── protocol.test.ts          # WorkerMessage type coverage
├── browser/                          # Browser devtools mode
│   ├── setup.ts                      # Browser-specific setup (none typically)
│   ├── levels.test.ts                # All levels → correct console.* method + CSS
│   ├── prefix.test.ts                # renderBrowserPrefix CSS format strings
│   ├── trace-levels.test.ts          # groupCollapsed wrapping for emerg/alert/crit
│   ├── mixins/
│   │   ├── limit.test.ts             # Rate limiting in browser context
│   │   └── spinner.test.ts           # Browser spinner (CSS badges, gradient progress)
│   ├── scope.test.ts                 # Browser scoped loggers
│   └── worker/
│       └── message-channel.test.ts   # MessageChannel-based worker proxy
└── tty/                              # Interactive terminal mode
    ├── setup.ts                      # Ensure process.stdout.isTTY=true, mock terminal
    ├── levels.test.ts                # ANSI-colored output for all levels
    ├── prefix.test.ts                # renderTTYPrefix with ANSI codes
    ├── spinner/
    │   ├── lifecycle.test.ts         # spin → update → success/fail lifecycle
    │   ├── sequential.test.ts        # Timer state machine (fake timers)
    │   ├── renderer.test.ts          # TTYRenderer cursor management
    │   └── progress.test.ts          # Progress bar rendering
    └── __snapshots__/                # ANSI snapshot files (rstest auto-managed)
```

### Structure Rationale

- **`tests/` at root, not `src/__tests__/`:** Tests are not part of the library source. Rslib excludes `*.dev.ts`; keeping tests entirely outside `src/` avoids any exclusion pattern complexity and keeps the build clean.
- **Environment-first, then feature:** The three runtimes have fundamentally different output capture strategies and environment requirements. Organizing by environment at the top level maps directly to rstest's `projects` feature — each folder is one project with its own config, setup file, and `include` glob.
- **`tests/helpers/` shared:** Cross-cutting utilities (registry reset, ANSI stripping) are used by multiple projects. Placing them in a sibling `helpers/` folder keeps imports short (`../helpers/registry-reset`) and avoids duplicating code across environments.
- **Feature subdirectories within each environment:** `prefix/`, `mixins/`, `worker/` mirror the source tree structure, making it obvious which test covers which module.

## Architectural Patterns

### Pattern 1: Three Rstest Projects (Environment Isolation)

**What:** Use rstest's `projects` field to define three completely independent test environments — `node`, `browser`, `tty` — each with its own setup, include pattern, and environment configuration.

**When to use:** Always. This is the core architectural decision.

**Trade-offs:**
- Pro: Each project runs in its correct environment with no cross-contamination
- Pro: Can run `--project node` for fast iteration on one environment
- Pro: Browser project uses Playwright; others use Node — no conflict
- Con: Some test logic is similar across environments (level filtering) — mitigate with shared helpers

**Example:**

```typescript
// rstest.config.ts
import { defineConfig } from '@rstest/core';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default defineConfig({
  extends: withRslibConfig(),
  // Silence logger output in test reporter — we capture it ourselves
  onConsoleLog: () => false,
  restoreMocks: true,
  projects: [
    {
      name: 'node',
      include: ['tests/node/**/*.test.ts'],
      setupFiles: ['tests/node/setup.ts'],
      env: { LLOGER_FORCE_CONSOLE: 'true' },
    },
    {
      name: 'browser',
      include: ['tests/browser/**/*.test.ts'],
      setupFiles: ['tests/browser/setup.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        headless: true,
      },
    },
    {
      name: 'tty',
      include: ['tests/tty/**/*.test.ts'],
      setupFiles: ['tests/tty/setup.ts'],
    },
  ],
});
```

### Pattern 2: Registry Reset Between Tests (Singleton Isolation)

**What:** The logger stores its singleton on `globalThis['$logger-registry']`. Every test that creates or configures a logger must reset this registry to prevent state leakage between tests.

**When to use:** In every test file's `beforeEach` hook, across all three projects.

**Trade-offs:**
- Pro: Complete isolation — no test ordering dependency
- Pro: Matches how the library bootstraps in real usage (fresh module load)
- Con: Slight overhead per test — negligible for a logger

**Example:**

```typescript
// tests/helpers/registry-reset.ts
const REGISTRY_KEY = '$logger-registry';

/** Wipe the singleton registry so the next Logger access creates a fresh root. */
export function resetRegistry(): void {
  const g = globalThis as Record<string, unknown>;
  delete g[REGISTRY_KEY];
}
```

```typescript
// In a test file
import { beforeEach } from '@rstest/core';
import { resetRegistry } from '../helpers/registry-reset';

beforeEach(() => {
  resetRegistry();
});
```

### Pattern 3: Console Spy Capture (Browser + Node Console Mode)

**What:** Use `rstest.spyOn(console, 'log')` (and `warn`, `error`, `info`, `debug`) to intercept and capture logger output for assertion. In Node console mode, also spy on `process.stdout.write` for JSON/logfmt output that goes directly to stdout.

**When to use:** Browser project (all tests) and Node project (pretty format tests). JSON/logfmt tests should capture `process.stdout.write` instead.

**Trade-offs:**
- Pro: Non-destructive — `mockRestore()` restores original behavior
- Pro: rstest already provides `restoreMocks: true` for automatic cleanup
- Pro: Captures the exact args passed to console.* for CSS assertion in browser
- Con: Must set `disableConsoleIntercept: true` for the logger projects, because rstest's default console interception would double-wrap our spies

**Example:**

```typescript
// tests/helpers/console-capture.ts
import { rstest } from '@rstest/core';

interface CapturedCall {
  method: string;
  args: unknown[];
}

/** Spy on all console methods, returning a log of calls. */
export function captureConsole(): { calls: CapturedCall[]; restore: () => void } {
  const calls: CapturedCall[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((m) =>
    rstest.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      calls.push({ method: m, args });
    }),
  );
  return {
    calls,
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
```

### Pattern 4: Stdout Write Interception (Node JSON/Logfmt + TTY)

**What:** For Node console mode with `json`/`logfmt` format, and for TTY mode, the logger writes directly to `process.stdout.write`. Intercept this to capture raw output strings including ANSI codes.

**When to use:** Node project (json/logfmt tests), TTY project (all tests).

**Trade-offs:**
- Pro: Captures the exact bytes the logger would write to a terminal
- Pro: ANSI codes are preserved for snapshot matching
- Con: Must restore the original `write` function — handled by `restoreMocks`

**Example:**

```typescript
// tests/helpers/stdout-capture.ts
import { rstest } from '@rstest/core';

/** Intercept process.stdout.write, collecting all written strings. */
export function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = rstest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      lines.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}
```

### Pattern 5: ANSI Snapshot Testing (TTY Mode)

**What:** For TTY output, use rstest's `toMatchFileSnapshot()` to store expected ANSI-colored output in dedicated `.ansi` files. Use a custom snapshot serializer that normalizes timestamps and durations but preserves ANSI escape codes.

**When to use:** TTY project — all tests that validate rendered output.

**Trade-offs:**
- Pro: CI-testable — comparing strings works everywhere
- Pro: `.ansi` file snapshots are human-reviewable when `cat`-ed to a terminal
- Pro: `toMatchFileSnapshot` allows custom extensions (`.ansi`) for clarity
- Con: Timestamps and durations must be normalized to avoid flakiness
- Con: ANSI snapshots are not fully "visual" — real rendering requires a terminal emulator

**Example:**

```typescript
// tests/helpers/ansi.ts

/** Strip ANSI escape codes for plain-text comparison. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

/** Normalize dynamic values (timestamps, durations) for stable snapshots. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\d{2}:\d{2}:\d{2}\.\d{3}/g, 'HH:MM:SS.mmm')  // timestamps
    .replace(/\d+(\.\d+)?ms/g, 'Xms')                        // durations
    .replace(/\d+(\.\d+)?s/g,  'Xs');                         // durations (seconds)
}
```

```typescript
// tests/tty/levels.test.ts
import { expect, test, beforeEach } from '@rstest/core';
import { captureStdout } from '../helpers/stdout-capture';
import { normalizeOutput } from '../helpers/ansi';
import { resetRegistry } from '../helpers/registry-reset';

beforeEach(() => resetRegistry());

test('info level outputs colored prefix', async () => {
  const { lines, restore } = captureStdout();
  // Stub isTTY for the environment detection
  const { Logger } = await import('../../src');
  Logger.info('hello world');
  restore();
  const output = normalizeOutput(lines.join(''));
  await expect(output).toMatchFileSnapshot('./__snapshots__/info-level.ansi');
});
```

### Pattern 6: Fake Timers for Spinner Tests

**What:** Spinner animations use `setTimeout` chains with jitter. Use rstest's `rstest.useFakeTimers()` to deterministically control timing, then `rstest.advanceTimersByTime()` to step through frames.

**When to use:** All spinner tests across all three projects.

**Trade-offs:**
- Pro: Deterministic — no flakiness from real timer variance
- Pro: Fast — no waiting for real animation intervals
- Con: Must call `rstest.useRealTimers()` in cleanup (handled by `restoreMocks`)

**Example:**

```typescript
import { test, expect, beforeEach, afterEach, rstest } from '@rstest/core';

beforeEach(() => {
  rstest.useFakeTimers();
});

afterEach(() => {
  rstest.useRealTimers();
});

test('spinner cycles through frames', () => {
  // ... create spinner, advance timers, assert frame output
  rstest.advanceTimersByTime(200); // advance past one spinner interval
});
```

## Data Flow

### Test Execution Flow (per project)

```
rstest.config.ts
    ↓ (resolves project)
setupFiles (e.g. tests/node/setup.ts)
    ↓ (sets env vars, patches globals)
beforeEach hooks
    ↓ (resets registry, creates capture spies)
test body
    ↓ (imports logger, calls methods, captures output)
assertions
    ↓ (expects on captured calls/lines/snapshots)
afterEach / restoreMocks
    ↓ (spies restored, registry cleared)
```

### Output Capture Strategy Per Environment

```
                    ┌─────────────────────────────────┐
                    │          Logger.info(...)        │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
         ┌────▼─────┐       ┌─────▼──────┐       ┌────▼─────┐
         │  Browser  │       │   Console  │       │   TTY    │
         │  project  │       │  project   │       │ project  │
         └────┬──────┘       └─────┬──────┘       └────┬─────┘
              │                    │                    │
    ┌─────────▼──────────┐   ┌────▼──────────┐   ┌────▼──────────┐
    │ console.log spy    │   │ stdout.write  │   │ stdout.write  │
    │ console.warn spy   │   │ spy (json/    │   │ spy (ANSI     │
    │ console.error spy  │   │ logfmt)       │   │ sequences)    │
    │ console.debug spy  │   │ + console spy │   │               │
    │                    │   │ (pretty)      │   │               │
    │ Assert: method,    │   │               │   │               │
    │ CSS args, format   │   │ Assert: JSON  │   │ Assert: ANSI  │
    │ string structure   │   │ parse, key/   │   │ file snapshots│
    │                    │   │ value pairs   │   │ + stripped    │
    └────────────────────┘   └──────────────┘   └───────────────┘
```

## Environment Isolation Strategy

### Critical: The Singleton Problem

The logger stores state on `globalThis['$logger-registry']`. Without isolation, tests share state:
- Root logger options mutated by one test affect the next
- Scope cache returns stale loggers
- Exclusive mode locks persist

**Solution:** Reset the registry key in `beforeEach`. Because rstest runs each test file in an isolated module context (default `isolate: true`), the module-level bootstrap in `src/logger/index.ts` re-runs per file. But within a file, multiple tests share the import — hence the need for registry reset.

### Critical: Environment Detection is Module-Level

`src/utils/env.ts` exports `isNode`, `isBrowser`, `isNodeTTY` as **top-level constants** evaluated at import time. This means:

- **Node project:** Set `LLOGER_FORCE_CONSOLE=true` via rstest's `env` config (runs before module evaluation) → `isNodeTTY` becomes `false`.
- **Browser project:** The real browser environment naturally has `isBrowser=true`, `isNode=false`.
- **TTY project:** Do NOT set `LLOGER_FORCE_CONSOLE`. In CI where `process.stdout.isTTY` is `false`, mock it in the setup file before the logger module loads. Use `rstest.stubGlobal` or directly patch `process.stdout.isTTY`.

### Critical: Console Intercept Conflict

Rstest intercepts `console.*` calls by default to track log sources. For a logger library, this creates a conflict:
- The library under test IS writing to console
- Rstest's intercept wraps the calls, altering timing and call stacks
- The `onConsoleLog` handler would suppress output we need to capture ourselves

**Solution:** Set `disableConsoleIntercept: true` in all test projects (or at root level). Use `onConsoleLog: () => false` at root to suppress logger noise from the test reporter. Capture output with our own spies.

### TTY Environment in CI

CI runners have `process.stdout.isTTY = undefined`. The TTY project must simulate a TTY:

```typescript
// tests/tty/setup.ts
// Patch before any logger module loads
Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
Object.defineProperty(process.stdout, 'rows', { value: 40, writable: true });
```

This works because rstest's `setupFiles` run before test files import the logger, and the env detection in `src/utils/env.ts` reads `process.stdout.isTTY` at module load time.

## Build Order for Test Infrastructure

Phases should be built in this order due to dependencies:

| Order | Phase | Depends On | Rationale |
|-------|-------|------------|-----------|
| 1 | **Rstest setup + shared helpers** | Nothing | Foundation — config, registry-reset, capture utilities, ANSI helpers |
| 2 | **Node/console tests** | Phase 1 | Simplest capture strategy (stdout.write + console spy). No Playwright dependency. Validates core log pipeline. |
| 3 | **Browser tests** | Phase 1 | Requires `@rstest/browser` + Playwright. Tests are structurally similar to Node but with different capture (console spy + CSS args). |
| 4 | **TTY tests** | Phase 1, 2 | Most complex. Requires isTTY mocking, ANSI snapshot infrastructure, fake timers for spinners. Build on patterns validated in Node tests. |
| 5 | **Worker tests** | Phase 2, 3 | Tests IPC serialization (Node fork) and MessageChannel (browser). Requires both Node and browser test infrastructure to be working. |

### Phase 1 Detail: Foundation

What gets built first:
1. `rstest.config.ts` with Rslib adapter and 3 project stubs
2. Install `@rstest/core`, `@rstest/adapter-rslib`, `@rstest/browser`, Playwright
3. `tests/helpers/registry-reset.ts`
4. `tests/helpers/console-capture.ts`
5. `tests/helpers/stdout-capture.ts`
6. `tests/helpers/ansi.ts`
7. `tests/helpers/fixtures.ts` (shared log messages, option presets)
8. Setup files for each project (`tests/node/setup.ts`, `tests/browser/setup.ts`, `tests/tty/setup.ts`)
9. One smoke test per project to validate the pipeline works

## Anti-Patterns

### Anti-Pattern 1: Testing Rendered Output as Plain Strings

**What people do:** Strip all ANSI codes and assert `output.includes('INFO')`.
**Why it's wrong:** Misses styling regressions — a broken color code or missing badge CSS silently passes. Also brittle to format changes.
**Do this instead:** For Node/TTY: snapshot the full ANSI output (normalized for timestamps). For Browser: assert the CSS args array alongside the format string. Use `stripAnsi` only for content-focused assertions (e.g., "the message text is correct"), not for style validation.

### Anti-Pattern 2: Importing Logger at Module Top Level

**What people do:** `import { Logger } from '../../src'` at the top of the test file, before `beforeEach` resets the registry.
**Why it's wrong:** The logger module bootstraps the singleton at import time. If the registry was used by a previous test in the same file, the import returns the cached (stale) module — the registry reset in `beforeEach` happens after the import.
**Do this instead:** Use dynamic `import()` inside the test body or in `beforeEach` after registry reset, combined with `rstest.resetModules()` to clear the module cache. Alternatively, use `rstest.mock` with `{ spy: true }` on the env module to control detection flags.

### Anti-Pattern 3: Real Timers in Spinner Tests

**What people do:** Use `await new Promise(r => setTimeout(r, 500))` to wait for spinner frames.
**Why it's wrong:** Slow, flaky in CI (timer resolution varies), creates race conditions with assertion timing.
**Do this instead:** Use `rstest.useFakeTimers()` and `rstest.advanceTimersByTime()` to deterministically step through spinner frames. Every spinner test should use fake timers.

### Anti-Pattern 4: One Giant Test File Per Environment

**What people do:** Put all node tests in `tests/node.test.ts`.
**Why it's wrong:** Module isolation breaks — all tests share one import of the logger. Registry resets between tests don't clear the module cache. Also, a failure in level tests blocks prefix tests from running.
**Do this instead:** One test file per feature domain (levels, prefix, mixins, format). Rstest's file-level isolation means each file gets a fresh module context.

## Integration Points

### Rslib Adapter

| Aspect | Detail | Notes |
|--------|--------|-------|
| `@rstest/adapter-rslib` | Reuses `rslib.config.ts` (source.exclude, TypeScript paths) | Avoids duplicating build config in test config |
| `libId` | Not needed — tests import source directly, not dist | Tests run against `src/`, not `dist/` |
| `source.define` | `__WORKER_SCRIPT__` constant needs override in test config | Mock or set to a test worker path |

### Module Boundaries

| Boundary | Testing Approach | Notes |
|----------|------------------|-------|
| `src/utils/env.ts` → everywhere | Mock `process.stdout.isTTY`, env vars via rstest's `env` config | Module-level constants — must be set before import |
| `src/logger/index.ts` ↔ mixins | Test mixins through the logger API, not in isolation | Mixins are tightly coupled via `DispatchFn` closure |
| `src/worker/proxy.ts` ↔ `worker.ts` | Test proxy serialization separately, then integration | Use in-memory MessageChannel instead of real fork |
| `src/logger/prefix/` pipeline | Unit test `serializeJSON`/`serializeLogfmt` directly | Pure functions — easy to test without logger instance |

## Sources

- [Rstest Projects documentation](https://rstest.rs/guide/basic/projects) — multi-project configuration (HIGH confidence)
- [Rstest Browser Mode](https://rstest.rs/guide/browser-testing/getting-started) — Playwright-based browser testing (HIGH confidence)
- [Rstest Rslib Integration](https://rstest.rs/guide/integration/rslib) — `@rstest/adapter-rslib` adapter (HIGH confidence)
- [Rstest Snapshot Testing](https://rstest.rs/guide/basic/snapshot) — inline, file, and custom serializer snapshots (HIGH confidence)
- [Rstest Mocking](https://rstest.rs/guide/basic/mock) — `rstest.spyOn`, `rstest.fn`, module mocking (HIGH confidence)
- [Rstest `disableConsoleIntercept`](https://rstest.rs/config/test/disable-console-intercept) — disable default console wrapping (HIGH confidence)
- [Rstest `onConsoleLog`](https://rstest.rs/config/test/on-console-log) — suppress console output in reporter (HIGH confidence)
- [Rstest `setupFiles`](https://rstest.rs/config/test/setup-files) — per-project setup scripts (HIGH confidence)
- Project source: `src/utils/env.ts`, `src/logger/index.ts` — environment detection and emit pipeline (direct code inspection)

---
*Architecture research for: @lalex/console test suite*
*Researched: 2026-03-24*

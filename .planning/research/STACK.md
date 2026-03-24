# Stack Research

**Domain:** Multi-environment TypeScript logger library testing
**Researched:** 2026-03-24
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@rstest/core` | `^0.9.4` | Test runner, assertions, snapshots, mocks | Native Rspack ecosystem integration — reuses rslib.config.ts via adapter; built-in TypeScript/ESM support; Vitest-compatible API (Chai assertions, `rstest.fn()`, `rstest.spyOn()`). Eliminates config duplication with the build toolchain. **HIGH confidence** — verified on [rstest.rs](https://rstest.rs) and npm. |
| `@rstest/adapter-rslib` | `^0.2.1` | Reuse rslib.config.ts in tests | `withRslibConfig()` auto-maps Rslib's `source.define`, `source.exclude`, `tools.rspack`, `resolve`, and `output.target` to rstest config so test builds match production builds. Supports `libId` for multi-lib configs. **HIGH confidence** — [official adapter docs](https://rstest.rs/guide/integration/rslib). |
| `@rstest/browser` | `^0.9.4` | Browser Mode — run tests in real Chromium | Tests execute in actual browser with real `console` API, `Web Workers`, and DOM. Peer-requires `playwright`. Essential for testing browser-specific logger paths (groupCollapsed, CSS-styled prefixes). **HIGH confidence** — [browser mode docs](https://rstest.rs/guide/browser-testing/getting-started). Marked experimental but actively maintained. |
| `playwright` | `^1.49.1` | Browser driver for @rstest/browser | Only supported provider for rstest browser mode (`provider: 'playwright'`). Must install Chromium binary via `npx playwright install chromium`. **HIGH confidence** — required peer dependency. |
| `@rstest/coverage-istanbul` | `^0.3.0` | Code coverage collection | Istanbul provider via SWC plugin. Supports per-file thresholds, glob-pattern thresholds, and standard reporters (text, html, json). **HIGH confidence** — [coverage docs](https://rstest.rs/config/test/coverage). |
| `path-serializer` | `^0.6.0` | Snapshot path normalization | Converts absolute paths in snapshots to relative `<ROOT>/...` placeholders. Prevents host-dependent snapshot drift. Used by rstest's own test suite. **HIGH confidence** — [snapshot serialization docs](https://rstest.rs/guide/basic/snapshot#serialization-output). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `strip-ansi` | `^7.1.0` | Strip ANSI escape codes from strings | In console/TTY test assertions when comparing plain text content against output that may contain ANSI color codes. Node 22 also has `node:util.stripVTControlCharacters()` — prefer the built-in when possible to avoid adding a dependency. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Rstest CLI (`rstest`) | Test execution | Add `"test": "rstest"` and `"test:browser": "rstest --config rstest.browser.config.ts"` to package.json scripts. Supports `rstest run` (single pass) and `rstest watch` (re-run on changes). |
| Rstest VS Code Extension | In-editor test runner | Browse, run, debug tests from VS Code. Available in VS Code marketplace. |
| `npx playwright install chromium` | Browser binary setup | Required once after installing `@rstest/browser`. CI needs `--with-deps` flag for system dependencies. |

## Installation

```bash
# Core test framework + Rslib adapter
pnpm add -D @rstest/core @rstest/adapter-rslib

# Browser mode (real browser tests)
pnpm add -D @rstest/browser playwright

# Coverage
pnpm add -D @rstest/coverage-istanbul

# Snapshot path normalization
pnpm add -D path-serializer

# Browser binary (not an npm dependency — one-time install)
npx playwright install chromium
```

## Configuration Architecture

### Multi-Project Setup

The library has 3 distinct output paths that require different test environments. Rstest's `projects` feature handles this with a single root config dispatching to environment-specific inline projects.

**Root config: `rstest.config.ts`**

```typescript
import { defineConfig } from '@rstest/core';
import { withRslibConfig } from '@rstest/adapter-rslib';

export default defineConfig({
  // Inherits source.exclude, source.define, tools.rspack from rslib.config.ts
  extends: withRslibConfig(),

  // Silence logger output during tests — the library under test calls console.*
  onConsoleLog: () => false,

  // Coverage across all projects
  coverage: {
    enabled: false, // enable via --coverage flag
    provider: 'istanbul',
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.dev.ts'],
  },

  projects: [
    // ── Node console mode (CI/pipe) ──
    {
      name: 'console',
      testEnvironment: 'node',
      include: ['tests/console/**/*.test.ts'],
      env: {
        LLOGER_FORCE_CONSOLE: 'true',
      },
    },
    // ── Node TTY mode ──
    {
      name: 'tty',
      testEnvironment: 'node',
      include: ['tests/tty/**/*.test.ts'],
    },
    // ── Shared Node tests (levels, options, prefix, serialization, etc.) ──
    {
      name: 'node',
      testEnvironment: 'node',
      include: ['tests/node/**/*.test.ts'],
      env: {
        LLOGER_FORCE_CONSOLE: 'true',
      },
    },
  ],
});
```

**Browser config: `rstest.browser.config.ts`**

```typescript
import { defineConfig } from '@rstest/core';

export default defineConfig({
  browser: {
    enabled: true,
    provider: 'playwright',
    headless: true,
  },
  include: ['tests/browser/**/*.test.ts'],
  onConsoleLog: () => false,
});
```

**Rationale for separate browser config:**
Browser mode projects cannot share `browser launch options` with non-browser projects in the same rstest process. The docs state "all Browser Mode projects must share the same browser launch options" and mixing browser/node in one run requires separate config files. Run via `"test:browser": "rstest --config rstest.browser.config.ts"`.

### Why `extends: withRslibConfig()`

The adapter maps these rslib.config.ts settings to rstest automatically:

| Rslib Config | Rstest Config | Effect for This Project |
|-------------|---------------|------------------------|
| `source.exclude` (`/\.dev\.ts$/`) | `source.exclude` | Playground files excluded from test builds |
| `source.define` | `source.define` | `__WORKER_SCRIPT__` compile-time constant available in tests |
| `tools.rspack` (chunkIds, chunkFilename) | `tools.rspack` | Consistent Rspack behavior between build and test |

### Adapter `libId` Option

The project has 3 lib entries. The adapter uses the shared/root Rslib config by default (no `libId` needed) because the main entry's config is suitable for testing. If worker-specific tests need the worker entry's `source.define.__WORKER_SCRIPT__`, use:

```typescript
extends: withRslibConfig({ libId: 'worker-proxy' }),
```

## Test Patterns by Environment

### Console Mode (Node CI) — stdout/stderr capture

**What the library does:** Calls `console.log/info/debug/warn/error` via `method.apply(activeConsole, [...])`. In json/logfmt mode, passes a serialized string. In pretty mode, passes colored prefix + args.

**Testing pattern: spy on console methods**

```typescript
import { expect, rstest, test, beforeEach, afterEach } from '@rstest/core';

let logSpy: ReturnType<typeof rstest.spyOn>;

beforeEach(() => {
  logSpy = rstest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

test('json format emits valid JSON', () => {
  // ... trigger logger.info('hello')
  expect(logSpy).toHaveBeenCalledTimes(1);
  const output = logSpy.mock.calls[0][0] as string;
  const parsed = JSON.parse(output);
  expect(parsed).toMatchObject({ level: 'info', message: 'hello' });
});
```

**Why spy, not redirect stdout:**
The library routes through `console.*` methods (not `process.stdout.write` directly) in console mode. Spying on `console.log` is the correct interception point. `rstest.spyOn()` is the idiomatic rstest approach, consistent with the mock docs.

**JSON/logfmt snapshot testing:**

```typescript
test('logfmt format', () => {
  // trigger logger.info('hello', { key: 'val' })
  expect(logSpy.mock.calls[0][0]).toMatchInlineSnapshot(
    `"level=info msg=hello key=val"`
  );
});
```

Use `toMatchInlineSnapshot()` for small, readable outputs. Use `toMatchSnapshot()` for larger outputs that would clutter the test file.

### Browser Mode — console capture

**What the library does:** Uses `console.log`, `console.groupCollapsed/groupEnd` (for trace-level logs), `console.debug`. Passes CSS-styled prefix strings via `%c` formatting.

**Testing pattern: spy on console in Playwright browser context**

```typescript
import { expect, rstest, test } from '@rstest/core';
// No @rstest/browser page import needed — we're testing console output, not DOM

test('browser logger uses groupCollapsed for error level', () => {
  const groupSpy = rstest.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
  const groupEndSpy = rstest.spyOn(console, 'groupEnd').mockImplementation(() => {});
  const logSpy = rstest.spyOn(console, 'log').mockImplementation(() => {});

  // trigger logger.error('fail')

  expect(groupSpy).toHaveBeenCalledTimes(1);
  expect(groupEndSpy).toHaveBeenCalledTimes(1);
  // First arg is CSS-styled prefix, second is the message
  expect(groupSpy.mock.calls[0]).toContain('fail');

  groupSpy.mockRestore();
  groupEndSpy.mockRestore();
  logSpy.mockRestore();
});
```

**Why real browser, not jsdom:**
The library uses `console.groupCollapsed`, `console.groupEnd`, and CSS `%c` formatting — jsdom's console simulation doesn't reproduce these accurately. Browser Mode runs in real Chromium via Playwright, so `console.*` behaves exactly as in production dev tools.

### TTY Mode — process.stdout.write + ANSI

**What the library does:** Calls `process.stdout.write()` directly (not console). Uses ANSI escape sequences for colors, cursor movement (`\x1b[?25h`, `\x1b[?25l`, `\x1b[...A\x1b[0J`), and the tty renderer for spinner animation.

**Testing pattern: spy on process.stdout.write**

```typescript
import { expect, rstest, test, beforeEach, afterEach } from '@rstest/core';
import { stripVTControlCharacters } from 'node:util';

let writeSpy: ReturnType<typeof rstest.spyOn>;
const captured: string[] = [];

beforeEach(() => {
  captured.length = 0;
  writeSpy = rstest.spyOn(process.stdout, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      captured.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }
  );
});

afterEach(() => {
  writeSpy.mockRestore();
});

test('TTY log line includes ANSI-styled prefix', () => {
  // trigger logger.info('hello') in TTY mode
  const raw = captured.join('');
  // Assert plain text content
  const plain = stripVTControlCharacters(raw);
  expect(plain).toContain('hello');
  // Assert ANSI codes are present
  expect(raw).toMatch(/\x1b\[/);
});
```

### ANSI Snapshot Testing

**Strategy: Dual-layer snapshots**

1. **Plain text snapshots** (CI-safe, primary assertions):
   Strip ANSI codes with `node:util.stripVTControlCharacters()`, then `toMatchInlineSnapshot()` or `toMatchSnapshot()`.

2. **ANSI-inclusive file snapshots** (visual consistency):
   Use `toMatchFileSnapshot('./snapshots/tty-info.ansi')` to store raw ANSI output in dedicated `.ansi` files. These catch regressions in color/style changes.

```typescript
test('TTY prefix rendering', async () => {
  // capture raw output
  const raw = captured.join('');
  const plain = stripVTControlCharacters(raw);

  // Primary assertion: content is correct
  expect(plain).toMatchInlineSnapshot(`"[INFO] hello"`);

  // Secondary assertion: ANSI styling is correct (reviewed visually, updated with -u)
  await expect(raw).toMatchFileSnapshot('./snapshots/tty-info.ansi');
});
```

**Custom snapshot serializer for ANSI:**

For snapshot readability, register a serializer that makes ANSI escape codes human-readable:

```typescript
// tests/setup.ts
import { expect } from '@rstest/core';

expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && val.includes('\x1b['),
  serialize: (val: string) => {
    // Replace raw escapes with readable tags for snapshot review
    return val.replace(/\x1b\[(\d+(?:;\d+)*)m/g, '<ansi:$1>');
  },
});
```

This makes snapshots like:
```
"<ansi:94>[INFO]<ansi:0> hello"
```
instead of raw escape bytes that are unreadable in diffs.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@rstest/core` | Vitest | If the project used Vite instead of Rslib/Rspack. Rstest reuses the Rspack build config directly — Vitest would need a separate bundler setup and duplicate configuration. |
| `@rstest/browser` (Playwright) | jsdom / happy-dom | For pure DOM manipulation tests where browser fidelity doesn't matter. This library uses `console.groupCollapsed`, CSS `%c` formatting, and Web Workers — jsdom cannot reproduce these. |
| `@rstest/adapter-rslib` | Manual rstest config | If the rslib config is very simple or you need incompatible Rspack options for tests. The adapter saves ~20 lines of duplicated config. |
| `@rstest/coverage-istanbul` | No coverage initially | Coverage can be deferred. Adding it now costs nothing — it's opt-in via `--coverage` flag. |
| `node:util.stripVTControlCharacters()` | `strip-ansi` npm package | If targeting Node < 16.11 (where the built-in was added). Node 22 has it — no need for the dependency. |
| `toMatchFileSnapshot` for ANSI | `toMatchSnapshot` for ANSI | File snapshots (`.ansi` extension) are better for raw ANSI because `.snap` files mix all snapshots together, making raw escape codes harder to review. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Jest | Extra bundler layer (Babel/ts-jest), doesn't integrate with Rspack ecosystem, slower transforms | `@rstest/core` — native Rspack integration, no extra transform step |
| Vitest | Vite-based — incompatible bundler, would require maintaining parallel build configs | `@rstest/core` — shares the same Rspack/Rsbuild toolchain |
| jsdom for browser tests | Cannot reproduce `console.groupCollapsed`, CSS `%c` log styling, or Web Workers | `@rstest/browser` with Playwright for real browser tests |
| happy-dom for browser tests | Same limitations as jsdom for this library's console patterns | `@rstest/browser` with Playwright |
| `child_process.spawn` for stdout capture | Over-engineered for this use case — the library outputs via `console.*` in CI mode | `rstest.spyOn(console, 'log')` — simpler, in-process |
| Writing stdout to temp files | Fragile, hard to clean up, race conditions | In-process spying with `rstest.spyOn()` |
| `FORCE_COLOR` env var in test env | Rstest workers run with piped stdio (no TTY), making ANSI detection unreliable across hosts | Test ANSI output by asserting escape codes are present in raw output; test content by stripping them |

## Stack Patterns by Environment

**Console mode tests (json/logfmt/pretty):**
- Set `LLOGER_FORCE_CONSOLE=true` via env config to force non-TTY path
- Spy on `console.log/info/warn/error` for output capture
- Parse JSON output for structured assertions
- Use `toMatchInlineSnapshot()` for logfmt/pretty format verification

**Browser mode tests:**
- Separate rstest config file (`rstest.browser.config.ts`) with `browser.enabled: true`
- Spy on `console.log`, `console.groupCollapsed`, `console.groupEnd`
- Verify CSS `%c` prefix formatting
- Headless Chromium for CI, headed for local debugging

**TTY mode tests:**
- Spy on `process.stdout.write` for raw output capture
- Use `node:util.stripVTControlCharacters()` for content assertions
- Use `toMatchFileSnapshot()` for ANSI-inclusive visual regression snapshots
- Spinner tests need timer control: `rstest.useFakeTimers()` + `rstest.advanceTimersByTime()`
- Cursor movement sequences (`\x1b[?25h`, `\x1b[...A\x1b[0J`) should be asserted in dedicated tests

**Shared (all environments):**
- Prefix pipeline (`getPrefix`, render functions, serialize functions) — pure functions, test with `expect(fn(input)).toEqual(output)`
- Level filtering and severity comparison — pure logic, no environment dependency
- Rate-limiting mixin — test timing with fake timers
- Option cascading (`computeOptions`) — pure logic, test layer merging

## rstest Console Interception Interaction

**Critical detail:** rstest intercepts `console.*` calls by default to track log sources. This conflicts with the library under test, which also calls `console.*`.

**Solution:** Use `onConsoleLog: () => false` in rstest config to suppress rstest's log display. The spies set up in tests still capture calls — rstest's interception layer doesn't prevent `rstest.spyOn()` from recording.

For tests that need to observe rstest's interception behavior (unlikely for this project), use `disableConsoleIntercept: true` to fully bypass it.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@rstest/core@^0.9.4` | `@rsbuild/core@2.0.0-beta.9` (bundled) | rstest vendors its own Rsbuild — does not conflict with project's `@rsbuild/core@^1.7.3` |
| `@rstest/core@^0.9.4` | `Node.js >= 20.19.0` | Project uses Node 22.16.0 — compatible |
| `@rstest/browser@^0.9.4` | `playwright@^1.49.1` | Install matching Playwright version |
| `@rstest/adapter-rslib@^0.2.1` | `@rslib/core@^0.20.0` | Reads rslib.config.ts — versions must be compatible |
| `@rstest/coverage-istanbul@^0.3.0` | `@rstest/core@^0.9.4` | Matched release cycle |

## package.json Scripts

```json
{
  "scripts": {
    "test": "rstest",
    "test:browser": "rstest --config rstest.browser.config.ts",
    "test:run": "rstest run",
    "test:coverage": "rstest run --coverage"
  }
}
```

## Sources

- [rstest.rs/guide/integration/rslib](https://rstest.rs/guide/integration/rslib) — Rslib adapter setup and `withRslibConfig()` API — **HIGH confidence**
- [rstest.rs/guide/browser-testing/getting-started](https://rstest.rs/guide/browser-testing/getting-started) — Browser Mode manual setup — **HIGH confidence**
- [rstest.rs/guide/basic/snapshot](https://rstest.rs/guide/basic/snapshot) — Snapshot testing API, file snapshots, custom serializers — **HIGH confidence**
- [rstest.rs/guide/basic/projects](https://rstest.rs/guide/basic/projects) — Multi-project configuration — **HIGH confidence**
- [rstest.rs/guide/basic/mock](https://rstest.rs/guide/basic/mock) — `rstest.spyOn()`, `rstest.fn()`, module mocking — **HIGH confidence**
- [rstest.rs/config/test/browser](https://rstest.rs/config/test/browser) — Browser config reference, mixing with node tests — **HIGH confidence**
- [rstest.rs/config/test/disable-console-intercept](https://rstest.rs/config/test/disable-console-intercept) — Console interception control — **HIGH confidence**
- [rstest.rs/config/test/on-console-log](https://rstest.rs/config/test/on-console-log) — `onConsoleLog` handler — **HIGH confidence**
- [rstest.rs/config/test/coverage](https://rstest.rs/config/test/coverage) — Istanbul coverage setup — **HIGH confidence**
- [npm: @rstest/core@0.9.4](https://www.npmjs.com/package/@rstest/core) — Package metadata, dependencies — **HIGH confidence**
- [npm: @rstest/browser@0.9.4](https://www.npmjs.com/package/@rstest/browser) — Peer dependencies (playwright) — **HIGH confidence**
- [github.com/web-infra-dev/rstest](https://github.com/web-infra-dev/rstest) — E2E test patterns (ANSI handling, console forwarding, snapshot diffs) — **HIGH confidence**
- Source code analysis of `src/logger/index.ts` — Output dispatch paths (emitTTY, emitConsole) — **HIGH confidence**

---
*Stack research for: @lalex/console testing milestone*
*Researched: 2026-03-24*

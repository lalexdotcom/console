# Pitfalls Research

**Domain:** TypeScript logger library testing (console capture, stdout interception, ANSI/TTY, singletons, worker IPC, timer animations)
**Researched:** 2026-03-24
**Confidence:** HIGH (patterns derived from codebase analysis + established testing knowledge)

## Critical Pitfalls

### Pitfall 1: GlobalThis Singleton Leaks Between Tests

**What goes wrong:**
The logger stores its registry on `globalThis['$logger-registry']`, the TTY renderer on `globalThis['$tty-renderer']`, and the worker proxy on `globalThis['$worker-logger-registry']`. When tests run in the same process (which rstest does by default), the singleton state persists across tests — scopes created in test A appear in test B, level/option mutations bleed, and the `exclusive` lock can deadlock subsequent tests.

**Why it happens:**
The registry is created once at module evaluation time via an IIFE. Re-importing the module returns the same registry. `globalThis` survives between test cases in the same worker/process. Developers write tests assuming a fresh logger per test, but the module-level closure keeps the old state.

**How to avoid:**
- Create a test utility that clears all three `globalThis` keys before each test (`beforeEach`): `delete (globalThis as any)['$logger-registry']`, `delete (globalThis as any)['$tty-renderer']`, `delete (globalThis as any)['$worker-logger-registry']`.
- After deleting, re-evaluate the module (or call a dedicated `__resetForTest()` function exposed only in test builds) so the IIFE runs again with a fresh registry.
- Never rely on import caching for test isolation — use `vi.resetModules()` (or rstest equivalent) to force fresh module evaluation per test when testing singleton behavior.
- If rstest supports `--isolate` (per-test worker), use it for the singleton test suite specifically.

**Warning signs:**
- Test passes in isolation but fails when run with other tests.
- "Already registered" or duplicate scope warnings in test output.
- Tests that depend on execution order.
- Flaky `exclusive` lock assertions.

**Phase to address:**
Phase 1 (test infrastructure setup) — build the `resetLogger()` helper before any test is written. Every subsequent phase depends on clean isolation.

---

### Pitfall 2: Console Monkey-Patching Corrupts the Test Harness

**What goes wrong:**
The library's `patch()` replaces `console.log`, `console.info`, `console.debug`, `console.warn`, and `console.error` globally. If `patch()` is called (directly or transitively) during a test and not `unpatch()`ed, the test framework's own console-based reporters break. Assertion failures, test results, and error messages vanish or get routed through the logger under test, creating an infinite loop or silent swallowing of diagnostics.

**Why it happens:**
Test frameworks (Jest, Vitest, rstest) intercept `console.*` methods for output capture and reporting. When the logger patches console first, the test framework's spy ends up wrapping the logger's method, not the real console. When the logger unpatches, it restores the original methods captured at module load time — blowing away the test framework's wrappers.

**How to avoid:**
- Never call `patch()` in unit tests that rely on console capture. Test `patch()`/`unpatch()` in a dedicated, isolated test file.
- Save and restore `console.*` methods in `beforeEach`/`afterEach` as a safety net:
  ```ts
  const saved = { log: console.log, info: console.info, ... };
  afterEach(() => Object.assign(console, saved));
  ```
- Use the `bypass()` / `restore()` API to redirect output to a mock console object instead of monkey-patching the global.
- In patch/unpatch tests, assert on the identity of `console.log` (reference equality) rather than trying to capture output through the patched methods.

**Warning signs:**
- Test output suddenly disappears or duplicates.
- "Maximum call stack exceeded" errors during tests.
- Test reporter shows 0 tests when tests clearly exist.
- `afterEach` cleanup fails because `console.error` is no longer the real one.

**Phase to address:**
Phase 1 (test infrastructure) — establish the console safety-net helper. Phase 3 (browser tests) and Phase 2 (console mode tests) — explicitly test `patch()`/`unpatch()` in isolated suites.

---

### Pitfall 3: stdout/stderr Capture Misses Buffered or Async Output

**What goes wrong:**
Tests intercept `process.stdout.write` or `process.stderr.write` to capture logger output, but miss lines that are buffered (Node flushes stdout asynchronously to pipes) or emitted in a `nextTick`/microtask. The captured output is incomplete, assertions fail intermittently, and the test appears flaky.

**Why it happens:**
In Node, `process.stdout.write` is synchronous when writing to a TTY but may be asynchronous when writing to a pipe (which is how test capture typically works — redirecting to a writable stream or buffer). Additionally, the logger's `__logFromMainProcess` path and worker-proxied output involve message passing that introduces timing gaps.

**How to avoid:**
- Intercept `process.stdout.write` synchronously by replacing it with a spy that pushes to an array — do NOT redirect to a PassThrough stream (adds async buffering).
  ```ts
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  ```
- For console-mode tests (json, logfmt, pretty), the logger calls `console.log`/`console.info` which internally calls `process.stdout.write`. Spy on the console method level, not the stream level, to avoid double-capture.
- Always restore `process.stdout.write` in `afterEach` — a crashed test that doesn't restore will corrupt all subsequent tests.
- For TTY mode, the renderer writes directly to `process.stdout.write` with ANSI escape sequences. Capture at the `process.stdout.write` level, not `console.*`.

**Warning signs:**
- Tests pass locally (TTY) but fail in CI (pipe).
- Captured output is empty string despite logger clearly executing.
- Tests pass with `--runInBand` but fail with parallel workers.
- ANSI escape sequences appear in captured output unexpectedly.

**Phase to address:**
Phase 2 (console/Node tests) — build stdout capture utility. Phase 4 (TTY tests) — extend with ANSI-aware capture.

---

### Pitfall 4: Stack Frame Offset Breakage From Test Wrapper Depth

**What goes wrong:**
The logger uses hardcoded `STACK_OFFSET = 6` (main path) and `STACK_OFFSET = 2` (limit mixin) to identify the user's call site. Test helper functions, mocking wrappers, and the test framework's own function wrapping add extra frames to the call stack. The logger reports the wrong file/line (pointing to test infrastructure instead of the actual test call site), and stack-dependent assertions fail.

**Why it happens:**
The offsets assume a specific call chain depth: `user → fn → emit → prepareLog → captureLines → Error`. Wrapping the logger call in a `callLogger()` test helper, or the framework's `it()` callback wrapper, shifts every frame. The same test may have different stack depths depending on whether it's run directly, through a describe block, or with beforeEach setup.

**How to avoid:**
- Never wrap logger calls in test helper functions when testing stack introspection. Call the logger directly inside the `it()` callback.
- For stack-offset tests, don't assert on exact file paths or line numbers — assert on the *shape* of the output (e.g., "contains a file:line:col pattern", "does not contain internal logger frames").
- Test stack offsets in a dedicated file with minimal nesting — avoid `describe` → `describe` → `it` chains.
- Use regex patterns like `/at .+\.test\.ts:\d+:\d+/` rather than exact `"test.ts:42:5"` assertions.
- Consider adding a `getCallerStackTrace` test that validates the frame index by calling from a known depth and checking the result contains the test file name.

**Warning signs:**
- Stack trace assertions break when a test is moved into or out of a `describe` block.
- CI shows different caller info than local runs.
- Assertions pass on one test framework version but break on updates.
- Tests reference internal files (`dispatch.ts`, `index.ts`) instead of the test file.

**Phase to address:**
Phase 2 (console/Node tests) — validate STACK_OFFSET correctness. Create a dedicated stack introspection test suite early to catch regressions.

---

### Pitfall 5: Timer-Dependent Spinner Tests Are Inherently Flaky

**What goes wrong:**
Spinner tests try to assert on intermediate animation states (frame changes, progress updates, elapsed time display) by advancing fake timers or waiting real time. The jitter function (`Math.random()` in `sequential.ts`), `setInterval`/`setTimeout` chains, and the TTY renderer's `tick()` cycle create non-deterministic timing that causes assertions to fail intermittently.

**Why it happens:**
The spinner uses `setTimeout` with jitter (`base + Math.floor((Math.random() * 2 - 1) * JITTER)`), so the exact tick timing is unpredictable. Fake timers (e.g., `vi.useFakeTimers()`) can advance time, but the spinner's internal state machine (`running`/`success`/`fail`) and the `stopped` flag interact with timer callbacks in ways that depend on exact scheduling. Race conditions appear when `success()` is called while a tick timer is pending.

**How to avoid:**
- Mock `Math.random` to return a fixed value (e.g., 0.5) for deterministic jitter in all spinner tests.
- Use fake timers AND mock `Math.random` together — one without the other still leaves non-determinism.
- Test spinner state transitions (start → running state, success → stopped, fail → stopped) separately from timer-driven rendering. The state machine is testable without timers.
- For render output assertions, advance time past the spinner interval + jitter range (e.g., `interval + JITTER + 1`) to guarantee at least one tick, rather than trying to assert on exact tick counts.
- Test `formatDuration()` as a pure function independently — no timers needed.
- For the TTY renderer, mock `process.stdout.write` and `process.stdout.columns` but don't try to assert on exact ANSI output frame-by-frame.

**Warning signs:**
- Tests pass 9/10 times but fail randomly on CI.
- Tests sensitive to CPU load (slower machines trigger different timer ordering).
- Assertions on "exactly 3 frames rendered" break intermittently.
- `clearTimeout` warnings in test output.

**Phase to address:**
Phase 3 or 4 (spinner-specific tests) — establish the `Math.random` + fake timer double-mock pattern before writing any spinner test.

---

### Pitfall 6: Worker/IPC Tests Leave Zombie Processes

**What goes wrong:**
Tests that spawn worker threads (`child_process.fork()`) or Web Workers fail to terminate them properly. Forked processes outlive the test, hold ports/file locks, prevent the test runner from exiting (hangs indefinitely), and accumulate across test runs until the system runs out of PIDs or memory.

**Why it happens:**
The worker proxy in `proxy.ts` and `index.ts` forks a child process and queues messages during setup. If a test creates the proxy but doesn't call `terminateWorker()`, the child process stays alive. If the test throws before reaching cleanup, the `afterEach` handler never runs. Node's IPC channel keeps the parent alive if the child is still connected.

**How to avoid:**
- Always call `terminateWorker()` in `afterEach`, not just at the end of the test body.
- Use a try/finally pattern or the test framework's cleanup hooks.
- Set a short timeout on worker tests — if the worker hangs, the test should fail fast rather than hang the entire suite.
- Verify cleanup worked: after `terminateWorker()`, check that `child.connected === false` and `child.killed === true`.
- Run worker tests in a separate test file with serial execution (`describe.sequential` or equivalent) — worker setup/teardown is inherently stateful.
- Consider adding a `process.on('exit')` guard in test setup that kills any remaining children.

**Warning signs:**
- Test runner doesn't exit after all tests pass (hangs with no output).
- `EADDRINUSE` or "too many open files" errors in CI.
- `ps aux | grep worker` shows orphaned Node processes.
- Test suite takes longer and longer on repeated runs.

**Phase to address:**
Phase 5 (worker tests) — build worker lifecycle helpers (`spawnTestWorker()` / `killTestWorker()`) with guaranteed cleanup before writing any IPC test.

---

### Pitfall 7: Browser Console Capture Is Fundamentally Different From Node

**What goes wrong:**
Developers write browser tests using the same `process.stdout.write` interception pattern from Node tests. In the browser, there is no `process.stdout` — output goes through `console.*` methods with CSS-styled `%c` formatting. The test framework's browser mode captures console calls differently (or not at all), and ANSI-based assertions are meaningless.

**Why it happens:**
The logger produces fundamentally different output in browser mode: `console.log('%c[prefix]%c message', 'color:blue', '', ...)` vs Node's `process.stdout.write('\x1b[34m[prefix]\x1b[0m message\n')`. Browser prefix rendering (`renderBrowserPrefix`) injects CSS style strings, while Node rendering (`renderConsolePrefix`, `renderTTYPrefix`) injects ANSI escape codes. Tests that aren't mode-aware assert on the wrong format.

**How to avoid:**
- Maintain completely separate test suites for browser and Node — do NOT share assertion helpers that assume output format.
- For browser tests, spy on `console.log`/`console.info`/etc. and assert on the arguments array including `%c` format strings and CSS values:
  ```ts
  expect(spy).toHaveBeenCalledWith('%c[INFO]%c hello', 'color:blue', '', 'world');
  ```
- For browser spinner tests, the spinner uses `console.clear()` and `console.log` — spy on both.
- rstest's browser mode should provide console capture natively; verify this works before building custom interception.
- Use the `isBrowser`/`isNode` flags from `utils/env.ts` to gate test setup, and mock them explicitly in tests to force the desired code path.

**Warning signs:**
- Browser tests that pass but assert on ANSI escape codes (wrong mode).
- `process is not defined` errors in browser test runner.
- Console output in browser tests contains raw `%c` strings instead of styled text.
- Browser tests import from `node:` protocol modules.

**Phase to address:**
Phase 3 (browser tests) — build browser-specific assertion helpers that understand `%c`/CSS format strings.

---

### Pitfall 8: Module-Level Side Effects Break Test Isolation

**What goes wrong:**
The logger modules execute side effects at import time: the registry IIFE runs, `isNode`/`isNodeTTY` are computed, `systemConsole` is captured, `__originalConsoleMethods` is snapshot, `utilInspect` is lazily loaded, and the TTY renderer installs `SIGINT`/`exit` handlers. These fire once per module evaluation and cannot be re-run without resetting the module cache. Tests that need different environment conditions (e.g., test as browser then test as Node) get stale values.

**Why it happens:**
ES module semantics guarantee that top-level code runs exactly once per module instance. The `isNode`, `isNodeTTY`, `isBrowser` flags are computed from `typeof process`, `process.stdout.isTTY`, and `typeof window` at import time. Mocking `process` or `window` after import has no effect on these flags.

**How to avoid:**
- Mock environment conditions BEFORE importing the module under test. Use dynamic `import()` inside tests after setting up the environment:
  ```ts
  globalThis.window = { document: {} }; // fake browser
  const { Logger } = await import('../logger/index.ts');
  ```
- Use `vi.resetModules()` (or rstest equivalent) between tests that need different environments.
- Group environment-dependent tests into separate files — one for Node/TTY, one for Node/console, one for browser. Don't try to test all three modes in a single file.
- For the `SIGINT` handler test, use a subprocess-based approach (fork a child that imports the module, send SIGINT, assert exit code 130).

**Warning signs:**
- `isNodeTTY` is always `true` even when you set `process.stdout.isTTY = false`.
- Browser mode tests incorrectly run Node code paths.
- Tests for `LLOGER_FORCE_CONSOLE` env var have no effect.
- `utilInspect` is defined in browser tests.

**Phase to address:**
Phase 1 (test infrastructure) — establish the module-reset pattern and environment-mocking utilities. Document which tests need module re-evaluation vs simple mocking.

---

### Pitfall 9: ANSI Snapshot Tests Are Fragile Across Platforms and Terminals

**What goes wrong:**
TTY mode tests snapshot the ANSI-escaped output (colors, cursor movement, line clearing) and compare byte-for-byte. These break when: terminal width differs between CI and local (`process.stdout.columns`), color support detection changes (`TERM`, `COLORTERM` env vars), or the snapshot was generated on macOS but CI runs Linux (different default terminal emulators report different capabilities).

**Why it happens:**
The TTY renderer calculates line counts using `process.stdout.columns` for text wrapping. The `colorize()` utility respects terminal color support. The spinner frames include `\x1b[?25l` (hide cursor), `\x1b[K` (clear line), `\x1b[XA` (move up X lines) — all dependent on current terminal dimensions. A snapshot from a 120-column terminal fails on an 80-column CI runner.

**How to avoid:**
- Mock `process.stdout.columns` to a fixed value (e.g., 80) in ALL TTY tests.
- Set `TERM=xterm-256color` and `COLORTERM=truecolor` in test setup for consistent color detection.
- Don't snapshot raw ANSI output verbatim. Instead:
  1. Parse ANSI sequences and assert on semantic content ("text is blue", "line was cleared").
  2. Or use an ANSI-stripping utility and snapshot only the plain text.
  3. Or snapshot the ANSI output but normalize line counts and cursor movements.
- For the TTY renderer's `tick()` output, assert on the number of `\x1b[A` (move-up) sequences matching the expected line count, not on the full rendered string.
- The resize handler test should mock `process.stdout.columns`, change it, emit a `resize` event, and verify recomputation — not snapshot the re-rendered output.

**Warning signs:**
- Snapshots need updating every time a developer changes their terminal font size.
- CI snapshot mismatches with only whitespace/column differences.
- macOS developer snapshots fail on Linux CI.
- Tests pass with `FORCE_COLOR=1` but fail without it.

**Phase to address:**
Phase 4 (TTY tests) — define the ANSI assertion strategy (strip-and-assert vs semantic parse) before writing any snapshot test.

---

### Pitfall 10: Testing Log Level Filtering Without Exhaustive Boundary Cases

**What goes wrong:**
Tests verify that `Logger.level = 'info'` suppresses `debug` and `verb` but forget edge cases: the `wth` level (lowest severity), `emerg` (highest severity that also triggers stack traces), the `success` level (non-standard, maps to `console.info` same as `notice`), and the interaction between level filtering and the `enabled` flag. Tests pass for the happy path but miss regressions in level comparison logic.

**Why it happens:**
The level system has 11 levels with non-obvious ordering (syslog-inspired). `success` sits between `warn` and `info` in severity. `wth` is the lowest, not an alias for any standard level. Developers test 3-4 levels and assume the rest work identically, but the `LEVEL_METHODS` mapping and `LogLevels` array ordering are independent systems that could get out of sync.

**How to avoid:**
- Test every boundary: for each of the 11 levels, set it as the threshold and verify that exactly the levels at or above it produce output, and all below are suppressed.
- Test the `enabled = false` override — it should suppress everything regardless of level.
- Test that `TRACE_LEVELS` (emerg, alert, crit) trigger stack trace capture while others don't.
- After adding `error` and `warn` to `TRACE_LEVELS` (the planned change), verify the boundary shifts correctly.
- Use a parameterized/table-driven test that iterates all 11 levels:
  ```ts
  for (const threshold of LogLevels) {
    it(`level=${threshold} filters correctly`, () => { ... });
  }
  ```

**Warning signs:**
- Tests only check `info` and `debug` levels.
- No test for `wth` or `success` levels.
- Stack trace tests only verify `emerg`, not the full `TRACE_LEVELS` set.
- Level comparison uses string equality instead of severity index.

**Phase to address:**
Phase 2 (console/Node tests) — implement the full level boundary matrix as one of the first test suites, since level filtering underpins all output tests.

---

### Pitfall 11: Scope Option Inheritance Tests Missing the Cascade

**What goes wrong:**
Tests verify that a child scope inherits the parent's options but miss the multi-layer cascade: `DEFAULT_LOGGER_OPTIONS` → `registry.rootOptions` → `scope.options` → per-call overrides. A test that sets `Logger.color = false` and checks `Logger.scope('x').color === false` passes, but the inverse (scope-level override of a root option) or default fallback is never tested. Regressions in `computeOptions()` go undetected.

**Why it happens:**
The `computeOptions` function merges options from four layers. Each property (`level`, `pad`, `color`, `date`, `uid`, `inspect`, `format`, `exclusive`) can be set at any layer. Developers test one layer at a time but not the precedence chain.

**How to avoid:**
- For each option property, test the full cascade:
  1. Default value (no root or scope override)
  2. Root override (set on Logger, inherited by scope)
  3. Scope override (set on scope, overrides root)
  4. Scope override removed (falls back to root, not to default)
- Test `computeOptions` directly as a unit if it's exported, or indirectly via output assertions.
- Include the `_exclusive` lock in cascade tests — it bypasses normal level filtering.

**Warning signs:**
- Tests only set options on the root logger.
- No test creates a scope with explicit options that differ from root.
- Tests don't verify the default fallback when no option is set.

**Phase to address:**
Phase 2 (console/Node tests) — test option cascade alongside level filtering.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term testing problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sharing stdout capture across describe blocks | Less setup code | Output from one test leaks into another's assertions; test order matters | Never — always reset capture per test |
| Using `any` casts in test helpers | Quick type silencing | Masks real type errors in logger API changes; tests pass but production breaks | Only for `globalThis` key deletion |
| Testing spinner output as exact strings | Easy to write | Every icon/color/frame constant change breaks all spinner tests | Only for pure-function helpers like `formatDuration` |
| Skipping `afterEach` cleanup "because tests pass" | Faster initial development | Zombie workers, leaked patches, stale singletons — failures appear later in unrelated tests | Never for process/worker/console tests |
| Snapshot testing ANSI output | Instant "visual" validation | Snapshot churn on any cosmetic change, platform differences | Only for serialization formats (json, logfmt) which are stable |
| Mocking `Date.now` globally | Deterministic timestamps | Breaks test framework's own timeout tracking; fake timers already mock Date | Only with fake timers flag that handles framework interaction |

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Test infrastructure setup | Singleton state leaking between tests | Build `resetLogger()` utility, enforce per-test module reset |
| Console/Node output tests | stdout capture missing async output | Synchronous `process.stdout.write` spy, not stream redirect |
| Console format tests (json/logfmt) | Timestamps in output make snapshots flaky | Mock `Date.now()` to a fixed value or strip timestamps before comparison |
| Browser console tests | `%c` CSS format assertions are brittle | Assert on argument count and format string pattern, not exact CSS values |
| TTY/ANSI tests | Column-width-dependent rendering | Mock `process.stdout.columns = 80` in all TTY tests |
| Spinner timer tests | Random jitter causes non-determinism | Mock both `Math.random` and timers simultaneously |
| Worker/IPC tests | Zombie child processes hang the test runner | Mandatory `afterEach` → `terminateWorker()` + timeout on worker tests |
| Stack introspection tests | Frame offset depends on test nesting depth | Call logger directly in `it()` callback, assert on pattern not exact path |
| Rate-limit (`once`/`limit`) tests | Call-site key depends on stack frame string | Provide explicit key argument in tests, don't rely on auto-generated keys |
| `patch()`/`unpatch()` tests | Corrupts test framework's console spy | Isolated test file, save/restore console methods in `afterEach` |
| Env var tests (`LLOGER_FORCE_CONSOLE`, `LLOGGER_ENABLED`) | Module-level flag computed at import time | Re-import module after setting env var, or run in subprocess |

---

*Pitfalls audit: 2026-03-24*

# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

**Dead legacy file (`index.old.ts`):**
- Issue: A 1100-line legacy implementation (`src/logger/index.old.ts`) remains in the codebase. It contains the entire previous class-based logger (with `LoggerBase`, `TTYSpinner`, `NodeConsoleSpinner`, `BrowserConsoleSpinner` classes) that was replaced by the current functional/mixin approach. It is excluded from compilation via `tsconfig.json` but still ships in the repository.
- Files: `src/logger/index.old.ts`, `tsconfig.json` (line 16: exclude pattern)
- Impact: Clutters the repository, misleads contributors, inflates git history.
- Fix approach: Delete `src/logger/index.old.ts` entirely. It serves no purpose; `git log` preserves history if needed.

**Massive code duplication in worker proxy (`proxy.ts` vs `index.ts`):**
- Issue: `src/worker/index.ts` (835 lines) and `src/worker/proxy.ts` (800 lines) contain near-identical implementations of the worker proxy. Both files export `workerLoggerSingleton` and `terminateWorker`, build the same scope proxies, spinner handles, transport abstractions, fallback logic, and option mirroring. The `index.ts` variant additionally mirrors *all* option flags (`_level`, `_pad`, `_color`, `_date`, `_uid`, `_inspect`, `_format`, `_exclusive`), while `proxy.ts` only mirrors `_captureStack` and `_enabled`. It is unclear which file is canonical — both are live and importable.
- Files: `src/worker/index.ts`, `src/worker/proxy.ts`
- Impact: Maintenance burden — any bug fix or feature must be applied twice. Divergence risk is high. The two files already differ in option-mirroring completeness, which could cause configuration bugs when switching between them.
- Fix approach: Choose one as the canonical implementation and delete the other. If the extra option-mirroring in `index.ts` is desired, consolidate into a single file. Consider extracting shared helpers (e.g. `cloneArg`, `buildSpinnerHandle`, `makeExecFn`, `stubUnusedMethods`) into a shared module.

**Duplicate `cloneArgs` implementations:**
- Issue: The argument cloning function (`cloneArgs` / `cloneArg`) is duplicated across three files with identical logic: `structuredClone` → `String()` → `'[unserializable]'`.
- Files: `src/worker/proxy.ts` (lines 133–162), `src/worker/index.ts`, `src/worker/limit.ts` (lines 29–32)
- Impact: Triple maintenance burden for the same trivial utility.
- Fix approach: Extract into a shared `src/worker/utils.ts` module.

**Duplicate `makeExecFn` implementations:**
- Issue: The `.exec()` helper is implemented independently in `src/logger/mixins/spinner/index.ts` and `src/worker/proxy.ts`. The worker version is slightly different (no `ExecOptions` import, uses plain `{ label?: string }` inline type).
- Files: `src/logger/mixins/spinner/index.ts` (lines 41–60), `src/worker/proxy.ts` (lines 549–567)
- Impact: Behavior could diverge over time if one is patched but not the other.
- Fix approach: Export from the spinner module and import in the proxy, or extract to a shared utility.

**`biome-ignore` lint suppressions (13 occurrences):**
- Issue: 13 `biome-ignore lint/suspicious/noExplicitAny` comments are scattered across the codebase to suppress `any` usage in dynamic property assignments. While explained with comments, they indicate type design gaps.
- Files: `src/logger/index.ts` (lines 119, 596), `src/worker/worker.ts` (line 90), `src/worker/index.ts` (lines 351, 358, 390, 806), `src/worker/proxy.ts` (lines 339, 371, 777), `src/logger/index.old.ts` (lines 188, 356, 545)
- Impact: Weakens type safety at critical runtime boundaries (dynamic option assignment, console method restoration).
- Fix approach: Use type-narrowed helpers or discriminated union utilities to avoid `any` casts. For console method restoration, type a `ConsoleMethods` record.

**Inconsistent environment variable naming:**
- Issue: Two env-var naming conventions coexist: `LLOGER_FORCE_CONSOLE` (one L, one G) and `LLOGGER_ENABLED` (two L's, two G's). This looks like a typo in one or the other, but both are used in production code paths.
- Files: `src/utils/env.ts` (lines 45, 49), `src/worker/index.ts` (line 289), `src/worker/proxy.ts` (line 263), `src/logger/index.ts` (line 214)
- Impact: Users may set the wrong variable and wonder why it has no effect. Confusing to document.
- Fix approach: Pick one naming scheme (e.g. `LLOGGER_*`) and migrate. Add a deprecation warning if the old name is detected.

## Known Bugs

**`patch()` assigns `console.info` twice:**
- Symptoms: In `createRootMixin`, `patch()` redundantly sets `console.info = self.info.bind(self)` twice — once via the chained assignment on line 586 and again explicitly on line 587.
- Files: `src/logger/index.ts` (lines 586–587)
- Trigger: Call `Logger.patch()`.
- Workaround: Harmless — both assignments produce the same result.

**`success` level maps to `console.info` — no visual distinction:**
- Symptoms: The `success` level is defined in the level system (`src/levels.ts`) with severity 6 and dispatches to `console.info`, identical to `notice` (severity 5) and `info` (severity 7). In browser devtools, it appears as a plain info-level message with no differentiation from `notice`.
- Files: `src/logger/index.ts` (line 90: `LEVEL_METHODS`), `src/levels.ts` (lines 16–17)
- Trigger: Use `Logger.success('done')` in the browser.
- Workaround: None — it works, but is visually identical to `info` in devtools log-level filters.

## Security Considerations

**`globalThis` singletons use stringly-typed keys without namespacing:**
- Risk: The logger registry (`$logger-registry`), TTY renderer (`$tty-renderer`), and worker proxy (`$worker-logger-registry`) are stored on `globalThis` using short, predictable string keys. Any library or script in the same runtime could accidentally (or intentionally) overwrite or read these values.
- Files: `src/logger/index.ts` (lines 47–56), `src/logger/mixins/spinner/tty/renderer.ts` (lines 249–250), `src/worker/proxy.ts` (lines 791–792), `src/worker/index.ts` (lines 826–827)
- Current mitigation: The keys start with `$` but are not Symbol-based.
- Recommendations: Use `Symbol.for()` keys for globalThis singletons. This prevents accidental collision while preserving cross-module sharing semantics.

**Worker messages are cast without validation:**
- Risk: In the worker script, incoming messages from IPC (`process.on('message')`) and `MessageChannel` (`self.addEventListener('message')`) are cast directly to `WorkerMessage` with `as WorkerMessage`. If a malicious or malformed message arrives, it is dispatched without validation.
- Files: `src/worker/worker.ts` (lines 118–120: `handle(raw as WorkerMessage)`), `src/worker/worker.ts` (lines 126–128: `handle(event.data as WorkerMessage)`)
- Current mitigation: `try/catch` wraps the handler, so malformed messages throw rather than corrupt state.
- Recommendations: Add a lightweight runtime type guard (`isWorkerMessage()`) before calling `handle()`. This prevents prototype-pollution-style attacks via crafted IPC messages.

**`opt:set` accepts arbitrary keys and values:**
- Risk: The `opt:set` message handler in the worker script does `(Logger as any)[msg.key] = msg.value`, allowing any property on the Logger to be set via IPC. If the message source is compromised, this enables arbitrary property injection.
- Files: `src/worker/worker.ts` (lines 90–91)
- Current mitigation: The IPC channel is only accessible from the parent process.
- Recommendations: Validate `msg.key` against an allowlist of known option keys before assignment.

**`require()` obfuscation for `util.inspect`:**
- Risk: The dynamic `require(\`${'util'}\`)` pattern in `src/utils/env.ts` (line 32) intentionally bypasses bundler static analysis. While functional, this pattern can confuse security scanners and is flagged by some SAST tools as potential dynamic dependency injection.
- Files: `src/utils/env.ts` (lines 30–35)
- Current mitigation: Only loads `util`, a Node built-in.
- Recommendations: Consider using a dynamic `import('node:util')` with top-level await or lazy init instead, which is ESM-native and scanner-friendly.

## Performance Bottlenecks

**Stack capture via `throw new Error()` on every log call:**
- Problem: When `stack=true`, every log call captures the call stack by throwing and catching an `Error`, then splitting and regex-parsing the `.stack` string. This is one of the most expensive operations a JS runtime can perform.
- Files: `src/utils/stack.ts` (lines 20–25: `captureLines` throws on every invocation)
- Cause: V8's `Error.stack` formatting is lazy but the throw/catch overhead is fixed. No caching is possible since each call has a unique stack.
- Improvement path: Use `Error.captureStackTrace()` directly (V8 API, avoids throw). Consider `Error.stackTraceLimit` tuning to capture fewer frames. For browser, `new Error().stack` without throw is sufficient in modern engines.

**Worker proxy serialises with `structuredClone` then IPC also clones:**
- Problem: In the Node worker path, `cloneArg()` calls `structuredClone()` on every log argument, then `child.send()` performs *another* structured clone internally (Node IPC serialisation). This double-cloning doubles the serialisation cost for every log call.
- Files: `src/worker/proxy.ts` (lines 133–155: `cloneArg`), `src/worker/index.ts` (similar)
- Cause: The explicit `structuredClone` was added to catch non-cloneable values before they hit IPC (which would throw). But the fallback-to-String is achievable via a try/catch around `child.send()` itself.
- Improvement path: For Node IPC, skip the pre-clone — just `try { child.send(msg) } catch { child.send(stringifiedMsg) }`. Keep `structuredClone` only for the browser `postMessage` path where failure semantics differ.

**TTY renderer resize listener recomputes all spinners:**
- Problem: Every terminal resize event triggers a full recomputation of all spinner line counts and an immediate redraw (`tick()`). With many active spinners, this can jank.
- Files: `src/logger/mixins/spinner/tty/renderer.ts` (lines 179–199: resize handler + reduce)
- Cause: The resize handler duplicates the rendering logic inline to recount lines.
- Improvement path: Cache the rendered line per spinner and only recompute `getLineCount()` on resize without re-rendering the full text.

**Timer-based spinner ticks with jitter:**
- Problem: Console/browser spinners use `setTimeout` chains with random jitter (`Math.random()`) for their tick interval. This creates unpredictable timing and prevents timer coalescing.
- Files: `src/logger/mixins/spinner/sequential.ts` (lines 37–39: `jitter()`)
- Cause: Jitter was likely added to prevent visual synchronisation artifacts. For console spinners that re-log each tick, the overhead is the timer allocation itself plus a full log dispatch per tick.
- Improvement path: Use `setInterval` with a fixed interval for console/browser spinners. Reserve jitter for contexts where timer coalescing matters.

## Fragile Areas

**Stack offset constants are hardcoded and brittle:**
- Files: `src/utils/stack.ts` (line 16: `STACK_OFFSET = 6`), `src/logger/mixins/limit.ts` (line 56: `STACK_OFFSET = 2`), `src/worker/proxy.ts` (multiple `getCallerInfoAt(4)` calls)
- Why fragile: Any refactoring that adds or removes a function in the call path (e.g. wrapping `emit` in a new helper, changing the mixin composition order) silently breaks stack introspection — the wrong frame is reported to the user.
- Safe modification: When changing internal call depth, manually verify the frame index by logging `new Error().stack` at the call site. Add inline comments documenting the expected stack trace.
- Test coverage: No automated tests exist; stack offset correctness is verified manually via dev play scripts (`src/play-node.dev.ts`, `src/play-browser.dev.ts`).

**Process signal handler for cursor restore:**
- Files: `src/logger/mixins/spinner/tty/renderer.ts` (lines 255–260)
- Why fragile: The `SIGINT` handler calls `process.exit(130)` after cleanup. This prevents other SIGINT handlers (e.g. from test frameworks, CLI tools) from running. If the renderer is loaded but never used (no spinners), the handler is still installed.
- Safe modification: Only install signal handlers when the first spinner is registered; remove when the last spinner is removed. Use `process.once` instead of `process.on` for SIGINT.
- Test coverage: None.

**Global console monkey-patching (`patch` / `unpatch`):**
- Files: `src/logger/index.ts` (lines 585–599), `src/worker/index.ts` (lines 771–805), `src/worker/proxy.ts` (lines 759–778)
- Why fragile: `patch()` replaces `console.log`, `console.info`, et al. globally. Multiple libraries or test harnesses may do the same, causing conflicts. `unpatch()` restores from a module-load-time snapshot, overwriting any patches applied by other code after load.
- Safe modification: Check `console.log === originalLog` before restoring; warn if another library patched between `patch()` and `unpatch()`.
- Test coverage: None — only exercised via play scripts.

**Singleton identity depends on exact `globalThis` key strings:**
- Files: `src/logger/index.ts` (line 48: `'$logger-registry'`), `src/logger/mixins/spinner/tty/renderer.ts` (line 249: `'$tty-renderer'`), `src/worker/index.ts` (line 826: `'$worker-logger-registry'`)
- Why fragile: If the key string is changed in any one file but not others (the worker proxy references `'$logger-registry'` via duck-typing), the logger silently creates a second registry, causing duplicate output or silent drops.
- Safe modification: Define keys as exported constants from a shared module and reference them everywhere.
- Test coverage: None.

## Scaling Limits

**UID tracking uses a `Map<unknown, number>` that never shrinks:**
- Current capacity: Unlimited growth — each unique object logged with `uid=true` is permanently stored in `UID_MAP`.
- Limit: Memory leak in long-running processes with high object churn.
- Files: `src/logger/index.ts` (lines 78–79)
- Scaling path: Use a `WeakMap<object, number>` (GC-friendly). For non-object args where `WeakMap` cannot be used, accept the trade-off or cap the map size.

**Limit counter map never clears:**
- Current capacity: One `LimitEntry` per unique call-site key, accumulated over the process lifetime.
- Limit: In very long-running processes with dynamic code generation (e.g. `eval`), the `entries` map grows without bound.
- Files: `src/logger/mixins/limit.ts` (line 88: `const entries = new Map()`)
- Scaling path: Add a `clearLimits()` method or use a time-windowed counter.

**Worker message queue has no back-pressure:**
- Current capacity: Unlimited in-memory queue during transport initialisation.
- Limit: If the fork/worker takes a long time to start (or fails silently), all log messages accumulate in RAM.
- Files: `src/worker/proxy.ts` (line 617: `const queue: WorkerMessage[] = []`), `src/worker/index.ts` (similar)
- Scaling path: Add a max queue size; drop oldest messages or switch to fallback logger when exceeded.

## Dependencies at Risk

**None critical.** The library has zero runtime dependencies (browser path) and relies only on Node built-ins (`child_process`, `node:util`, `node:process`). Build-time dependencies (`rslib`, `rsbuild`, `typescript`, `biome`) are standard and actively maintained.

## Missing Critical Features

**No test suite:**
- Problem: There are zero test files (`*.test.*`, `*.spec.*`) in the entire project. All behavior is validated manually via play scripts (`src/play-node.dev.ts`, `src/play-browser.dev.ts`).
- Blocks: Refactoring any of the fragile areas above without regression risk. Cannot validate stack offset correctness, spinner lifecycle, level filtering, option cascading, or worker message routing automatically.

**No `bypass()` / `restore()` on ScopeLogger:**
- Problem: The `ScopeLogger` interface inherits `Logger` which doesn't expose `bypass` / `restore`, but the `RootLogger` does. If a user tries to bypass output on a scope, there is no mechanism.
- Files: `src/types.ts` (lines 132–149)
- Blocks: Advanced use cases where scope-level output redirection is desired.

**No graceful worker error recovery:**
- Problem: If the forked worker process crashes or becomes unresponsive, the proxy has no retry or automatic fallback mechanism — messages continue to be sent into the void.
- Files: `src/worker/proxy.ts` (line 218: only logs the error), `src/worker/index.ts` (similar)
- Blocks: Reliability in production scenarios where the worker may OOM or crash.

## Test Coverage Gaps

**Entire codebase:**
- What's not tested: Everything. There are zero automated tests.
- Files: All `src/**/*.ts` files.
- Risk: Any change can introduce regressions in level filtering, option cascading, prefix rendering, spinner lifecycle, worker IPC, stack introspection, or format serialisation — none of which would be caught automatically.
- Priority: **High** — this is the single highest-risk concern in the project.

---

*Concerns audit: 2026-03-24*

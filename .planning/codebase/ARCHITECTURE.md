# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Singleton-based, environment-adaptive structured logger with mixin composition and IPC-based worker offloading.

**Key Characteristics:**
- Singleton root logger stored on `globalThis` via a fixed registry key, shared across duplicate module loads (CJS + ESM, node_modules duplication)
- Mixin composition: the core logger is assembled by layering functional mixins (`limit`, `override`, `spinner`) onto a base object via `Object.assign`
- Environment-adaptive output: runtime detection (`isNode`, `isNodeTTY`, `isBrowser`) selects the render path (TTY with cursor control, console with ANSI/CSS, browser devtools with `%c` format strings)
- Structured prefix pipeline: log metadata is represented as a typed `Prefix[]` array built by `getPrefix()`, then rendered to the target environment by separate render functions
- Worker proxy pattern: an optional `@lalex/console/worker` entry provides a RootLogger-compatible proxy that serialises messages over IPC (Node fork) or MessageChannel (Web Worker) to a dedicated worker that owns stdout

## Layers

**Public API (`src/types.ts`, `src/index.ts`):**
- Purpose: Defines all public-facing types and re-exports the logger singleton
- Location: `src/types.ts`, `src/index.ts`
- Contains: `Logger`, `RootLogger`, `ScopeLogger`, `LogMethod`, `LoggerSpinner`, `LoggerOptions`, `LogLevel`, `LimitedLogger`, `GenericLogger` type definitions
- Depends on: `src/logger/levels.ts` (for `LogLevel`)
- Used by: Consumer code and the worker proxy

**Core Logger (`src/logger/index.ts`):**
- Purpose: Implements the full logger lifecycle — registry, option cascading, log preparation, environment-adaptive emission, scope creation, and mixin assembly
- Location: `src/logger/index.ts`
- Contains: `createLogger()`, `createCoreLogger()`, `createScopeLogger()`, `prepareLog()`, `emit()`, `emitTTY()`, `emitConsole()`, `computeOptions()`, singleton `registry`, exported `Logger` / `L`
- Depends on: levels, utils, prefix, dispatch, all mixins
- Used by: `src/index.ts` (re-export), `src/worker/worker.ts` (message handler)

**Level Definitions (`src/levels.ts`, `src/logger/levels.ts`):**
- Purpose: Core log levels shared by logger and worker; display metadata (labels, styles, severity)
- Location: `src/levels.ts` (shared constants: `LEVEL_METHODS`, `LogLevels`, `TRACE_LEVELS`), `src/logger/levels.ts` (display config: `LEVEL_DISPLAY`, `DEFAULT_INSPECT_OPTIONS`, CSS generation)
- Contains: Numeric severity map, display labels, ANSI/CSS styles, padded labels for alignment
- Depends on: `src/utils/env.ts` (for `isNode`, `isBrowser`)
- Used by: Core logger, worker proxy, prefix system

**Prefix System (`src/logger/prefix/`):**
- Purpose: Builds environment-agnostic semantic prefix items, then renders them to the target format
- Location: `src/logger/prefix/`
- Contains: `Prefix` union type and subtypes (`LevelPrefix`, `DatePrefix`, `IconPrefix`, `CallerPrefix`, `TextPrefix`, `ProgressPrefix`), `getPrefix()` builder, `renderBrowserPrefix()`, `renderTTYPrefix()`, `renderConsolePrefix()`, `serializeJSON()`, `serializeLogfmt()`
- Depends on: `src/logger/levels.ts`, `src/utils/color.ts`
- Used by: Core logger (`prepareLog`, `emitTTY`, `emitConsole`), spinner mixins

**Dispatch (`src/logger/dispatch.ts`):**
- Purpose: Defines the `DispatchFn` type — the interface between mixins and the core logger's `emit()`
- Location: `src/logger/dispatch.ts`
- Contains: `DispatchFn`, `DispatchOptions` type definitions
- Depends on: prefix types, logger types
- Used by: All mixins (limit, override, spinner), core logger

**Mixins (`src/logger/mixins/`):**
- Purpose: Composable behaviors layered onto the core logger
- Location: `src/logger/mixins/`
- Contains:
  - `limit.ts` — `createLimitMixin()`: rate-limiting via `once()` and `limit()`, returns `LimitedLogger`
  - `override.ts` — `createOverrideMixin()`: one-shot option overrides via `options()`
  - `spinner/` — `createSpinnerMixin()`: attaches `.spin()` and `.exec()` to every level method
- Depends on: `DispatchFn`, logger types, spinner sub-modules
- Used by: `createLogger()`, `createScopeLogger()` in core logger

**Spinner Subsystem (`src/logger/mixins/spinner/`):**
- Purpose: Animated status indicators with platform-specific rendering
- Location: `src/logger/mixins/spinner/`
- Contains:
  - `sequential.ts` — `createSequentialSpinner()`: core timing/state machine shared by all platforms
  - `browser/` — `createBrowserSpinner()`: CSS-styled badges + progress bars for devtools
  - `console/` — `createConsoleSpinner()`: ANSI icon badges for pipe/CI output
  - `tty/` — `createTTYSpinner()` + `ttyRenderer`: real-time cursor-controlled animation with progress bars
- Depends on: `DispatchFn`, prefix types, `src/utils/color.ts`
- Used by: `createSpinnerMixin()`

**Utilities (`src/utils/`):**
- Purpose: Low-level helpers shared across the codebase
- Location: `src/utils/`
- Contains:
  - `env.ts` — environment detection (`isNode`, `isBrowser`, `isNodeTTY`, `isNodeConsole`, `isMainBrowser`, `isWebWorker`), lazy `util.inspect` loader, `env` process variables
  - `color.ts` — `colorize()` ANSI SGR wrapper with named color palette (`STYLES`)
  - `stack.ts` — call-site introspection (`getLogCallerInfo()`, `getCallerStackTrace()`, `getCallerInfoAt()`, `parseFrame()`)
- Depends on: Node built-ins (optional)
- Used by: Core logger, prefix system, spinner system, worker proxy

**Worker System (`src/worker/`):**
- Purpose: Off-thread logging — moves all I/O to a dedicated process/worker
- Location: `src/worker/`
- Contains:
  - `index.ts` — public entry: exports `WL` (worker-backed RootLogger proxy), `terminateWorker()`
  - `proxy.ts` — proxy builder: `createWorkerLoggerProxy()` builds a full RootLogger-compatible facade over IPC
  - `protocol.ts` — `WorkerMessage` discriminated union: all IPC message types
  - `worker.ts` — worker script: receives messages, routes to real Logger instance
  - `limit.ts` — `createWorkerLimitMixin()`: worker-aware rate limiting that forwards keys over IPC
- Depends on: `src/levels.ts`, `src/types.ts`, `src/utils/stack.ts`
- Used by: Consumer code via `import { WL } from '@lalex/console/worker'`

## Data Flow

**Standard Log Call (`Logger.info('message')`):**

1. User calls `Logger.info(...)` → level method closure in `createLogMethod()`
2. `emit()` is invoked with `(level, args, state, self)`
3. `prepareLog()` runs guards (enabled, exclusive, level filter), resolves options via `computeOptions()`, builds `Prefix[]` via `getPrefix()`, optionally captures call-site via `getLogCallerInfo()`, inspects non-string args via `util.inspect`
4. If `prepareLog()` returns null → silently dropped
5. Environment branch: `isNodeTTY` → `emitTTY()`, else → `emitConsole()`
6. `emitTTY()` renders prefix via `renderTTYPrefix()`, writes through `ttyRenderer` (if spinners active) or directly to `process.stdout`
7. `emitConsole()`: in Node non-TTY → `serializeJSON()` or `serializeLogfmt()` depending on `registry.format`; in Node pretty mode → `renderConsolePrefix()`; in browser → `renderBrowserPrefix()` with `%c` CSS substitutions

**Worker Proxy Log Call (`WL.info('message')`):**

1. User calls `WL.info(...)` → proxy level method in worker `proxy.ts`
2. Proxy captures call-site (if `stack=true`) and timestamp via `Date.now()`
3. Args are cloned via `structuredClone()` and packed into a `WorkerMessage` of type `'log'`
4. Message is sent via IPC (Node fork `child.send()`) or `Worker.postMessage()` (browser)
5. Worker script (`worker.ts`) receives message, calls `Logger.__logFromMainProcess()` with pre-captured caller string
6. Standard emit pipeline runs in the worker context, which owns stdout/TTY

**Spinner Lifecycle:**

1. `Logger.info.spin('Loading...')` → `spinFunction()` in `createSpinnerMixin()`
2. `selectSpinnerFactory()` picks platform: `createTTYSpinner`, `createConsoleSpinner`, or `createBrowserSpinner`
3. Platform factory creates a `SequentialSpinner` with a platform-specific `SpinnerRenderFn`
4. The render function calls `dispatch()` on each tick, injecting icon/progress into `extraPrefixItems`
5. TTY: `dispatch` → `emit` → `emitTTY` → `ttyRenderer.addSpinner()` → interval-driven cursor repositioning and frame cycling
6. `success()`/`fail()` stops the timer and emits a final line with the outcome icon

**Option Cascading:**

1. `computeOptions()` receives variadic `...layers` of partial options
2. Layers are stacked: `[own options, ...layers, registry.rootOptions, DEFAULT_LOGGER_OPTIONS]`
3. For each key, the first defined value wins (leftmost priority)
4. Special: `level` uses the strictest (lowest numeric severity) across all layers
5. Special: `inspect` is shallow-merged right-to-left (own keys win)

**State Management:**
- Global singleton via `registry` on `globalThis['$logger-registry']`
- Registry holds: `root` (RootLogger), `rootOptions` (live reference to root's raw options), `scopes` (named child loggers), `exclusive` (lock holder), `format` (output format)
- Each logger holds a `LoggerState` with its own partial options and optional scope name
- Option getters compute on-the-fly by cascading through `computeOptions()`
- Scope loggers are lazily created and cached in `registry.scopes`

## Key Abstractions

**Logger / RootLogger / ScopeLogger:**
- Purpose: Hierarchical logger with option inheritance
- Examples: `src/logger/index.ts` (createLogger, createScopeLogger), `src/types.ts` (interfaces)
- Pattern: Singleton root + lazy-created named scopes. Scopes inherit root options via `computeOptions()` cascading. Both share the same `createCoreLogger()` base.

**Prefix (semantic log metadata):**
- Purpose: Environment-agnostic representation of log line metadata
- Examples: `src/logger/prefix/types.ts` (union type), `src/logger/prefix/index.ts` (builder), `src/logger/prefix/render.ts` (renderers), `src/logger/prefix/serialize.ts` (JSON/logfmt)
- Pattern: Builder produces `Prefix[]`, deferred rendering at emit time. Each prefix item carries enough data for both pretty and structured output.

**DispatchFn (mixin ↔ core bridge):**
- Purpose: Decouples mixins from the `emit()` function and its closure-scoped dependencies
- Examples: `src/logger/dispatch.ts`
- Pattern: Created in `createLogger()`/`createScopeLogger()` as a closure that forwards to `emit()`. Passed to all mixins as their sole output channel.

**SequentialSpinner (cross-platform timer):**
- Purpose: Owns start/update/success/fail lifecycle with jittered setTimeout chain
- Examples: `src/logger/mixins/spinner/sequential.ts`
- Pattern: Platform layer provides a `SpinnerRenderFn`; the sequential spinner handles timing, state, and duration tracking. Platforms only decide *how* to render.

**TTYRenderer (terminal cursor manager):**
- Purpose: Exclusive owner of stdout cursor position in TTY mode
- Examples: `src/logger/mixins/spinner/tty/renderer.ts`
- Pattern: Maintains a Map of active spinners, an interval-driven tick loop, and a pending-log queue. Erases spinner lines → flushes queued logs → redraws spinners on each tick.

**WorkerMessage (IPC protocol):**
- Purpose: Typed discriminated union for all main-to-worker communication
- Examples: `src/worker/protocol.ts`
- Pattern: Exhaustive `type` discriminant covering log, spin (start/update/success/fail/stop), and option mutation messages.

## Entry Points

**Main Entry (`src/index.ts` → `src/logger/index.ts`):**
- Location: `src/index.ts`
- Triggers: `import { Logger } from '@lalex/console'`
- Responsibilities: Re-exports everything from `src/logger/index.ts`. The root logger singleton is created at module load time in the logger module's bootstrap block.

**Worker Entry (`src/worker/index.ts`):**
- Location: `src/worker/index.ts`
- Triggers: `import { WL } from '@lalex/console/worker'`
- Responsibilities: Creates the worker logger proxy (`WL`), sets up IPC transport (Node fork or Web Worker), provides `terminateWorker()`. The proxy is usable synchronously — messages before transport ready are buffered.

**Worker Script (`src/worker/worker.ts`):**
- Location: `src/worker/worker.ts`
- Triggers: Spawned by the proxy via `child_process.fork()` (Node) or `new Worker()` (browser)
- Responsibilities: Receives `WorkerMessage` via IPC/MessageChannel, dispatches to real Logger instance, manages spinner handles in a local Map.

## Error Handling

**Strategy:** Defensive catch at emit boundary — errors during log emission never propagate to user code.

**Patterns:**
- `emit()` wraps the entire `prepareLog` + render path in a try/catch; on failure, falls back to `console.error()` with the raw error message
- Worker proxy: `structuredClone` failures fall back to `String(arg)`, then `'[unserializable]'`
- Sequential spinner: `stopped` flag acts as a terminal state guard — all methods become no-ops after stop/success/fail, preventing stale timer callbacks

## Cross-Cutting Concerns

**Logging:** Self-referential — the library IS the logging system. Internal errors use raw `console.error()` to avoid recursion.

**Validation:** Level filtering via `LEVEL_SEVERITY` numeric comparison in `prepareLog()`. Enabled/exclusive guards before any work. No schema validation on options — TypeScript types enforce correctness at compile time.

**Authentication:** Not applicable — this is a client-side logging library.

**Environment Detection:** Centralised in `src/utils/env.ts`. All runtime branching queries these constants: `isNode`, `isBrowser`, `isNodeTTY`, `isNodeConsole`, `isMainBrowser`, `isWebWorker`.

---

*Architecture analysis: 2026-03-24*

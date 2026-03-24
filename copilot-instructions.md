<!-- GSD:project-start source:PROJECT.md -->
## Project

**@lalex/console**

A zero-dependency, environment-adaptive structured logger for Node.js and browsers. It provides a singleton logger with syslog-severity levels (emerg→wth), environment-aware rendering (browser devtools, Node TTY with cursor control, Node CI with json/logfmt/pretty), scoped child loggers, spinner animations, rate limiting, and optional worker-thread offloading via IPC or MessageChannel.

**Core Value:** Reliable, structured logging that adapts its output format to the runtime environment — browser devtools, Node TTY, or CI — without any configuration from the consumer.

### Constraints

- **Zero dependencies**: Library must remain dependency-free at runtime
- **No version changes**: Never modify version in package.json or create git tags
- **TypeScript strict mode**: No `any`, named exports only, interface over type for object shapes
- **Language**: All code, comments, and documentation in English
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.3 — All source code (`src/**/*.ts`)
- JSON — Configuration files (`package.json`, `tsconfig.json`, `biome.json`)
- YAML — Workspace config (`pnpm-workspace.yaml`)
## Runtime
- Node.js 22.x (dev container provides v22.16.0)
- Browser (main thread and Web Workers)
- pnpm 10.11.0 (declared via `packageManager` field in `package.json`)
- Lockfile: `pnpm-lock.yaml` present
## Frameworks
- No application framework — this is a standalone logging library (`@lalex/console` v2.0.0)
- Rslib `^0.20.0` — Library build tool (ESM output with DTS generation). Config: `rslib.config.ts`
- Rsbuild `^1.7.3` — Dev server for browser playground. Config: `rsbuild.config.ts`
- Rspack — Underlying bundler used by Rslib/Rsbuild (configured via `tools.rspack` in `rslib.config.ts`)
- tsx `^4.21.0` — TypeScript execution for Node.js playground scripts
- Biome `2.4.7` — Linting and formatting (replaces ESLint + Prettier). Config: `biome.json`
- No test framework detected. No test files, no test config, no test scripts in `package.json`.
## Key Dependencies
- **Zero runtime dependencies** — The library has no `dependencies` field in `package.json`. It is entirely self-contained.
| Package | Version | Purpose |
|---------|---------|---------|
| `@biomejs/biome` | `2.4.7` | Linting and formatting |
| `@rsbuild/core` | `^1.7.3` | Dev server for browser playground |
| `@rsbuild/plugin-node-polyfill` | `^1.4.4` | Polyfills Node.js built-ins for browser playground |
| `@rslib/core` | `^0.20.0` | Library build tool (ESM + DTS) |
| `@types/node` | `^24.10.13` | Node.js type definitions |
| `tsx` | `^4.21.0` | TypeScript runner for dev scripts |
| `typescript` | `^5.9.3` | TypeScript compiler (type checking only — `noEmit: true`) |
## Node Built-in Usage
- `node:util` — `InspectOptions` type, `inspect()` (lazy-loaded), `stripVTControlCharacters()`
- `node:process` — `env`, `process.stdout.isTTY`, `process.argv`
- `child_process` — `fork()` for worker transport (dynamic import in `src/worker/proxy.ts`)
## Build Configuration
### Rslib (`rslib.config.ts`)
| Entry | Source | Output | DTS |
|-------|--------|--------|-----|
| Main (`@lalex/console`) | `src/index.ts` | `dist/index.js` | Yes |
| Worker proxy (`@lalex/console/worker`) | `src/worker/index.ts` | `dist/worker/index.js` | Yes |
| Worker script (runtime) | `src/worker/worker.ts` | `dist/worker/worker.js` | No |
- `optimization.chunkIds = 'named'` — Human-readable chunk names
- `output.chunkFilename = '[name].js'` — Named chunk output
- `source.exclude: [/\.dev\.ts$/]` — Excludes playground files from build
- `source.define.__WORKER_SCRIPT__` — Compile-time constant for worker script path
### Rsbuild (`rsbuild.config.ts`)
- Entry: `src/play-browser.dev.ts`
- Port: 3000
- Plugin: `@rsbuild/plugin-node-polyfill` (polyfills `node:util`, `node:process` for browser)
- `source.define.__PLAY_MODE__` — Injected from `PLAY_MODE` env var
- Custom middleware: disables caching for worker-related requests
### TypeScript (`tsconfig.json`)
- `target`: ES2018
- `module`: ESNext
- `moduleResolution`: bundler
- `strict`: true
- `noEmit`: true (type checking only — Rslib handles emit)
- `lib`: DOM, ES2022
- `exclude`: `*.old.ts`, `*.dev.ts` (excludes playground and legacy files from type checking)
### Biome (`biome.json`)
- Formatter: spaces (not tabs), single quotes for JS/TS
- Linter: recommended rules enabled
- Assist: auto-organize imports
- VCS: git-aware (uses `.gitignore`)
- CSS: CSS modules enabled
## Package Exports
## Scripts
| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `rslib build` | Production library build |
| `dev` | `rslib build --watch` | Watch mode rebuild |
| `check` | `biome check --write` | Lint + format with auto-fix |
| `format` | `biome format --write` | Format only with auto-write |
| `play:node` | `tsx src/play-node.dev.ts --mode main` | Node playground (console mode) |
| `play:node:logfmt` | `tsx src/play-node.dev.ts --mode main --format logfmt` | Node playground (logfmt output) |
| `play:node:pretty` | `tsx src/play-node.dev.ts --mode main --format pretty` | Node playground (pretty output) |
| `play:node:worker` | `tsx src/play-node.dev.ts --mode worker` | Node playground (worker mode) |
| `play:node:worker:logfmt` | `tsx src/play-node.dev.ts --mode worker --format logfmt` | Node playground (worker + logfmt) |
| `play:node:worker:pretty` | `tsx src/play-node.dev.ts --mode worker --format pretty` | Node playground (worker + pretty) |
| `play:tty` | `tsx --watch src/play-node.dev.ts --mode main` | TTY playground with watch |
| `play:tty:worker` | `tsx --watch src/play-node.dev.ts --mode worker` | TTY worker playground with watch |
| `play:browser` | `rsbuild dev` | Browser playground dev server |
| `play:browser:worker` | `PLAY_MODE=worker rsbuild dev` | Browser playground (worker mode) |
| `version` | `npx upversion@latest` | Version bumping |
## Environment Variables
| Variable | Purpose | Used In |
|----------|---------|---------|
| `LLOGER_FORCE_CONSOLE` | When `"true"`, forces non-TTY console mode (disables ANSI spinners) | `src/utils/env.ts` |
| `PLAY_MODE` | Sets browser playground mode (`main` or `worker`) | `rsbuild.config.ts` |
## Platform Requirements
- Node.js 18+ (syntax target)
- pnpm 10.11.0+
- Dev container based on Debian GNU/Linux 12 (bookworm)
- Node.js 18+ (ESM, `node:` imports)
- Any modern browser with ES2018 support and Web Worker API
- ESM-only — no CommonJS fallback
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## TypeScript Configuration
- `target`: ES2018
- `module`: ESNext
- `moduleResolution`: bundler
- `lib`: DOM, ES2022
- `isolatedModules: true`
- `skipLibCheck: true`
- `allowImportingTsExtensions: true`
- `noEmit: true` (Rslib handles emit)
## Naming Patterns
- `kebab-case.ts` — all source files use lowercase kebab-case
- `index.ts` — barrel files for module entry points
- `*.dev.ts` — development playground scripts (excluded from build)
- `*.old.ts` — deprecated code kept for reference (excluded from build)
- `const.ts` — module-scoped constants
- `types.ts` — module-scoped type definitions
- `camelCase` — all functions: `createLogMethod`, `computeOptions`, `getPrefix`, `serializeJSON`
- Factory pattern: `create*` prefix for constructor-like functions: `createCoreLogger`, `createScopeLogger`, `createLimitMixin`, `createSpinnerMixin`, `createBrowserSpinner`, `createSequentialSpinner`
- Getters: `get*` prefix: `getPrefix`, `getDatePrefix`, `getLogCallerInfo`, `getCallerStackTrace`
- Boolean-returning helpers: `is*` or `has*` prefix: `isNode`, `isBrowser`, `isNodeTTY`
- `camelCase` for locals and parameters
- `UPPER_SNAKE_CASE` for module-level constants: `LEVEL_METHODS`, `STACK_OFFSET`, `DEFAULT_LOGGER_OPTIONS`, `SPINNER_INTERVAL_JITTER`
- Underscore-prefixed `_camelCase` for module-level mutable state: `_captureStack`, `_enabled`, `_terminateTransport`
- `PascalCase` for all types: `LogLevel`, `LoggerOptions`, `SpinnerState`, `DispatchFn`
- Suffix `Fn` for function type aliases: `DispatchFn`, `ConsoleFn`, `SpinnerRenderFn`, `SendFn`, `LimitSendFn`
- Suffix `Options` for option bags: `LoggerOptions`, `SpinnerOptions`, `ExecOptions`, `PrefixOptions`, `DispatchOptions`
- Suffix `State` for internal state types: `LoggerState`, `SpinnerState`
## Type Definition Conventions
- `LoggerSpinner`, `Logger`, `RootLogger`, `ScopeLogger` in `src/types.ts`
- Used for shapes that represent runtime objects with methods
- Union types: `Prefix`, `WorkerMessage`, `LogLevel`
- Simple object shapes: `LogLevelStyle`, `SpinnerOptions`, `TextPrefix`
- Function signatures: `DispatchFn`, `SpinnerRenderFn`
- Mapped types: `LogLevelDisplay`, `LogLevelParam`
- `Prefix` union in `src/logger/prefix/types.ts` discriminated by `type` field
- `WorkerMessage` union in `src/worker/protocol.ts` discriminated by `type` field
- `LEVEL_METHODS` in `src/levels.ts`
- Console method maps in `src/logger/index.ts`
- Logger registry initialisation in `src/logger/index.ts`
- ANSI color palette in `src/utils/color.ts`
- Consistently used throughout: `import type { LogLevel } from './types'`
- Separates value imports from type imports in all files
## Export Conventions
- `src/index.ts` → `export * from './logger'`
- `src/logger/prefix/index.ts` → `export type { DatePrefix, IconPrefix, ... } from './types'`
- `src/logger/types.ts` → `export * from '../types'` (re-exports public types)
- `src/logger/index.ts` → `export { LogLevels } from '../levels'`
- Public API: re-exported through barrel chain up to `src/index.ts`
- Internal utilities: exported from their own module but NOT re-exported to the public barrel
- Examples: `src/utils/color.ts` exports `colorize` but it never reaches `src/index.ts`
- `@lalex/console` → `src/index.ts` → logger + types
- `@lalex/console/worker` → `src/worker/index.ts` → worker proxy
## Code Style
- Indent style: spaces
- Quote style: single quotes
- Organise imports: enabled (`source.organizeImports: "on"`)
- Linter: recommended rules
- Pure functions preferred: `computeOptions`, `colorize`, `getPrefix`, `parseFrame`
- Factory functions returning closures over private state: `createLimitMixin`, `createSpinnerMixin`, `createOverrideMixin`
- Immutable data: `as const` on constant objects, spread copies for option merging
- No classes — the entire codebase is class-free; object composition via `Object.assign`
- Guard clauses at function top: null checks, enabled checks, level filtering
- See `prepareLog` in `src/logger/index.ts` — multiple early `return null` guards
- Logger state captured in closures rather than `this` bindings
- `createCoreLogger` declares `let self!: RootLogger | ScopeLogger` and captures it in all method closures
- Mixin functions (`createLimitMixin`, `createOverrideMixin`) return plain objects with closure-captured state
- Logger objects are built incrementally: `Object.assign(self, override, limited, spinner, { scope })`
- Spinners attach `.spin()` and `.exec()` to existing function objects via `Object.assign(fn, { spin, exec })`
## Import Organization
- No path aliases — all imports use relative paths
- `node:` prefix for Node built-ins: `node:process`, `node:util`
## Error Handling
- `emit` in `src/logger/index.ts`: wraps the entire log output path, falls back to `console.error`
- `utilInspect` lazy loader in `src/utils/env.ts`: catches require failure, returns `undefined`
- Spinner `makeExecFn` in `src/logger/mixins/spinner/index.ts`: catches promise rejection, marks spinner as failed, re-throws
- `structuredClone` → `String()` → `'[unserializable]'` chain in `src/worker/limit.ts`
- Optional chaining for nullable access: `process?.versions?.node`, `(e as Error).stack?.split('\n')`
- Nullish coalescing for defaults: `options.duration ?? false`, `config.optimization ??= {}`
## Comment Conventions
- Purpose, parameter descriptions, return value semantics
- Example: `getLogCallerInfo`, `createSequentialSpinner`, `terminateWorker` in `src/worker/proxy.ts`
- Stack frame numbering documented with frame-by-frame breakdown: `src/utils/stack.ts`
- `biome-ignore` suppressions always include an explanation: `// biome-ignore lint/suspicious/noExplicitAny: union key — value types are compatible per-key at runtime`
- `// ── Section Name ──────────────────────` pattern used throughout for visual grouping
- Consistent in all major files: `src/logger/index.ts`, `src/worker/proxy.ts`, `src/logger/prefix/types.ts`
## `any` Usage Policy
- Dynamic key assignment on typed objects: `(computed as any)[key] = layer[key]`
- Console methods that share shape but have divergent TS types
- Dynamic level method creation via loop: `(result as unknown as Record<string, unknown>)[level] = fn`
## Module Design
- `src/levels.ts` — level definitions only
- `src/utils/env.ts` — environment detection only
- `src/utils/stack.ts` — stack introspection only
- `src/utils/color.ts` — ANSI colorization only
- `src/logger/mixins/limit.ts` — rate limiting mixin
- `src/logger/mixins/override.ts` — option override mixin
- `src/logger/mixins/spinner/` — spinner mixin with platform-specific implementations
- `src/logger/mixins/spinner/browser/` — browser spinner
- `src/logger/mixins/spinner/console/` — non-TTY console spinner
- `src/logger/mixins/spinner/tty/` — TTY spinner with ANSI renderer
- `src/logger/mixins/spinner/sequential.ts` — shared timing/lifecycle logic
- Platform directories provide `create*Spinner` factories with platform-specific rendering
## Globals and Singletons
- `src/logger/index.ts` uses `globalThis['$logger-registry']` to survive duplicate module loads
- Ensures a single logger instance even with CJS + ESM dual-load
- Worker proxy in `src/worker/proxy.ts` uses module-level `let` variables to mirror logger options
- Justified by the proxy being a singleton; documented with comments
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Singleton root logger stored on `globalThis` via a fixed registry key, shared across duplicate module loads (CJS + ESM, node_modules duplication)
- Mixin composition: the core logger is assembled by layering functional mixins (`limit`, `override`, `spinner`) onto a base object via `Object.assign`
- Environment-adaptive output: runtime detection (`isNode`, `isNodeTTY`, `isBrowser`) selects the render path (TTY with cursor control, console with ANSI/CSS, browser devtools with `%c` format strings)
- Structured prefix pipeline: log metadata is represented as a typed `Prefix[]` array built by `getPrefix()`, then rendered to the target environment by separate render functions
- Worker proxy pattern: an optional `@lalex/console/worker` entry provides a RootLogger-compatible proxy that serialises messages over IPC (Node fork) or MessageChannel (Web Worker) to a dedicated worker that owns stdout
## Layers
- Purpose: Defines all public-facing types and re-exports the logger singleton
- Location: `src/types.ts`, `src/index.ts`
- Contains: `Logger`, `RootLogger`, `ScopeLogger`, `LogMethod`, `LoggerSpinner`, `LoggerOptions`, `LogLevel`, `LimitedLogger`, `GenericLogger` type definitions
- Depends on: `src/logger/levels.ts` (for `LogLevel`)
- Used by: Consumer code and the worker proxy
- Purpose: Implements the full logger lifecycle — registry, option cascading, log preparation, environment-adaptive emission, scope creation, and mixin assembly
- Location: `src/logger/index.ts`
- Contains: `createLogger()`, `createCoreLogger()`, `createScopeLogger()`, `prepareLog()`, `emit()`, `emitTTY()`, `emitConsole()`, `computeOptions()`, singleton `registry`, exported `Logger` / `L`
- Depends on: levels, utils, prefix, dispatch, all mixins
- Used by: `src/index.ts` (re-export), `src/worker/worker.ts` (message handler)
- Purpose: Core log levels shared by logger and worker; display metadata (labels, styles, severity)
- Location: `src/levels.ts` (shared constants: `LEVEL_METHODS`, `LogLevels`, `TRACE_LEVELS`), `src/logger/levels.ts` (display config: `LEVEL_DISPLAY`, `DEFAULT_INSPECT_OPTIONS`, CSS generation)
- Contains: Numeric severity map, display labels, ANSI/CSS styles, padded labels for alignment
- Depends on: `src/utils/env.ts` (for `isNode`, `isBrowser`)
- Used by: Core logger, worker proxy, prefix system
- Purpose: Builds environment-agnostic semantic prefix items, then renders them to the target format
- Location: `src/logger/prefix/`
- Contains: `Prefix` union type and subtypes (`LevelPrefix`, `DatePrefix`, `IconPrefix`, `CallerPrefix`, `TextPrefix`, `ProgressPrefix`), `getPrefix()` builder, `renderBrowserPrefix()`, `renderTTYPrefix()`, `renderConsolePrefix()`, `serializeJSON()`, `serializeLogfmt()`
- Depends on: `src/logger/levels.ts`, `src/utils/color.ts`
- Used by: Core logger (`prepareLog`, `emitTTY`, `emitConsole`), spinner mixins
- Purpose: Defines the `DispatchFn` type — the interface between mixins and the core logger's `emit()`
- Location: `src/logger/dispatch.ts`
- Contains: `DispatchFn`, `DispatchOptions` type definitions
- Depends on: prefix types, logger types
- Used by: All mixins (limit, override, spinner), core logger
- Purpose: Composable behaviors layered onto the core logger
- Location: `src/logger/mixins/`
- Contains:
- Depends on: `DispatchFn`, logger types, spinner sub-modules
- Used by: `createLogger()`, `createScopeLogger()` in core logger
- Purpose: Animated status indicators with platform-specific rendering
- Location: `src/logger/mixins/spinner/`
- Contains:
- Depends on: `DispatchFn`, prefix types, `src/utils/color.ts`
- Used by: `createSpinnerMixin()`
- Purpose: Low-level helpers shared across the codebase
- Location: `src/utils/`
- Contains:
- Depends on: Node built-ins (optional)
- Used by: Core logger, prefix system, spinner system, worker proxy
- Purpose: Off-thread logging — moves all I/O to a dedicated process/worker
- Location: `src/worker/`
- Contains:
- Depends on: `src/levels.ts`, `src/types.ts`, `src/utils/stack.ts`
- Used by: Consumer code via `import { WL } from '@lalex/console/worker'`
## Data Flow
- Global singleton via `registry` on `globalThis['$logger-registry']`
- Registry holds: `root` (RootLogger), `rootOptions` (live reference to root's raw options), `scopes` (named child loggers), `exclusive` (lock holder), `format` (output format)
- Each logger holds a `LoggerState` with its own partial options and optional scope name
- Option getters compute on-the-fly by cascading through `computeOptions()`
- Scope loggers are lazily created and cached in `registry.scopes`
## Key Abstractions
- Purpose: Hierarchical logger with option inheritance
- Examples: `src/logger/index.ts` (createLogger, createScopeLogger), `src/types.ts` (interfaces)
- Pattern: Singleton root + lazy-created named scopes. Scopes inherit root options via `computeOptions()` cascading. Both share the same `createCoreLogger()` base.
- Purpose: Environment-agnostic representation of log line metadata
- Examples: `src/logger/prefix/types.ts` (union type), `src/logger/prefix/index.ts` (builder), `src/logger/prefix/render.ts` (renderers), `src/logger/prefix/serialize.ts` (JSON/logfmt)
- Pattern: Builder produces `Prefix[]`, deferred rendering at emit time. Each prefix item carries enough data for both pretty and structured output.
- Purpose: Decouples mixins from the `emit()` function and its closure-scoped dependencies
- Examples: `src/logger/dispatch.ts`
- Pattern: Created in `createLogger()`/`createScopeLogger()` as a closure that forwards to `emit()`. Passed to all mixins as their sole output channel.
- Purpose: Owns start/update/success/fail lifecycle with jittered setTimeout chain
- Examples: `src/logger/mixins/spinner/sequential.ts`
- Pattern: Platform layer provides a `SpinnerRenderFn`; the sequential spinner handles timing, state, and duration tracking. Platforms only decide *how* to render.
- Purpose: Exclusive owner of stdout cursor position in TTY mode
- Examples: `src/logger/mixins/spinner/tty/renderer.ts`
- Pattern: Maintains a Map of active spinners, an interval-driven tick loop, and a pending-log queue. Erases spinner lines → flushes queued logs → redraws spinners on each tick.
- Purpose: Typed discriminated union for all main-to-worker communication
- Examples: `src/worker/protocol.ts`
- Pattern: Exhaustive `type` discriminant covering log, spin (start/update/success/fail/stop), and option mutation messages.
## Entry Points
- Location: `src/index.ts`
- Triggers: `import { Logger } from '@lalex/console'`
- Responsibilities: Re-exports everything from `src/logger/index.ts`. The root logger singleton is created at module load time in the logger module's bootstrap block.
- Location: `src/worker/index.ts`
- Triggers: `import { WL } from '@lalex/console/worker'`
- Responsibilities: Creates the worker logger proxy (`WL`), sets up IPC transport (Node fork or Web Worker), provides `terminateWorker()`. The proxy is usable synchronously — messages before transport ready are buffered.
- Location: `src/worker/worker.ts`
- Triggers: Spawned by the proxy via `child_process.fork()` (Node) or `new Worker()` (browser)
- Responsibilities: Receives `WorkerMessage` via IPC/MessageChannel, dispatches to real Logger instance, manages spinner handles in a local Map.
## Error Handling
- `emit()` wraps the entire `prepareLog` + render path in a try/catch; on failure, falls back to `console.error()` with the raw error message
- Worker proxy: `structuredClone` failures fall back to `String(arg)`, then `'[unserializable]'`
- Sequential spinner: `stopped` flag acts as a terminal state guard — all methods become no-ops after stop/success/fail, preventing stale timer callbacks
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

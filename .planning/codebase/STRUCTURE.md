# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
console/
├── src/                          # All source code
│   ├── index.ts                  # Main entry — re-exports from logger/
│   ├── types.ts                  # Public type definitions (Logger, LogMethod, SpinnerOptions, etc.)
│   ├── levels.ts                 # Shared level constants (LEVEL_METHODS, LogLevels, TRACE_LEVELS)
│   ├── env.d.ts                  # Build-time constant declarations (__WORKER_SCRIPT__)
│   ├── play-node.dev.ts          # Dev playground — Node CLI (excluded from build)
│   ├── play-browser.dev.ts       # Dev playground — browser (excluded from build)
│   ├── logger/                   # Core logger implementation
│   │   ├── index.ts              # Logger factory, emit pipeline, singleton bootstrap
│   │   ├── types.ts              # Internal types (LoggerState), re-exports public types
│   │   ├── const.ts              # Default logger options (DEFAULT_LOGGER_OPTIONS)
│   │   ├── levels.ts             # Level display metadata (LEVEL_DISPLAY, styles, CSS)
│   │   ├── dispatch.ts           # DispatchFn type — mixin-to-core interface
│   │   ├── index.old.ts          # Legacy file (excluded from build via tsconfig)
│   │   ├── prefix/               # Prefix system — build + render log line metadata
│   │   │   ├── index.ts          # getPrefix(), getDatePrefix(), getDurationPrefix()
│   │   │   ├── types.ts          # Prefix union type and all sub-types
│   │   │   ├── render.ts         # renderBrowserPrefix(), renderTTYPrefix(), renderConsolePrefix()
│   │   │   └── serialize.ts      # serializeJSON(), serializeLogfmt() for structured output
│   │   └── mixins/               # Composable logger behaviors
│   │       ├── limit.ts          # Rate-limiting: once(), limit() → LimitedLogger
│   │       ├── override.ts       # One-shot option overrides: options() → GenericLogger
│   │       └── spinner/          # Animated status indicators
│   │           ├── index.ts      # createSpinnerMixin() — attaches .spin()/.exec() to levels
│   │           ├── const.ts      # Shared spinner constants (SPINNER_INTERVAL_JITTER, SpinnerIcon)
│   │           ├── sequential.ts # Core spinner state machine (timing, lifecycle)
│   │           ├── browser/      # Browser devtools spinner
│   │           │   ├── index.ts  # createBrowserSpinner()
│   │           │   └── const.ts  # Browser spinner icons, colors, interval
│   │           ├── console/      # Non-TTY Node spinner (pipe, CI)
│   │           │   ├── index.ts  # createConsoleSpinner()
│   │           │   └── const.ts  # Console spinner icons, colors, interval
│   │           └── tty/          # Interactive TTY spinner with cursor control
│   │               ├── index.ts  # createTTYSpinner()
│   │               ├── const.ts  # TTY spinner icons, frames, interval
│   │               └── renderer.ts # TTYRenderer — cursor management, interval tick loop
│   ├── utils/                    # Low-level shared utilities
│   │   ├── index.ts              # Barrel (empty — no re-exports, internal-only)
│   │   ├── env.ts                # Environment detection (isNode, isBrowser, isNodeTTY, etc.)
│   │   ├── color.ts              # ANSI SGR colorize() + named color palette (STYLES)
│   │   └── stack.ts              # Call-site introspection (parseFrame, getLogCallerInfo, etc.)
│   └── worker/                   # Off-thread logging system
│       ├── index.ts              # Worker entry — exports WL proxy + terminateWorker()
│       ├── proxy.ts              # createWorkerLoggerProxy() — RootLogger facade over IPC
│       ├── protocol.ts           # WorkerMessage discriminated union (IPC types)
│       ├── worker.ts             # Worker script — receives messages, routes to Logger
│       └── limit.ts              # createWorkerLimitMixin() — rate limiting over IPC
├── dist/                         # Build output (generated, not committed)
├── package.json                  # Package manifest — dual exports: "." and "./worker"
├── rslib.config.ts               # Rslib build config — 3 entries (main, worker proxy, worker script)
├── rsbuild.config.ts             # Rsbuild dev server config (browser playground)
├── tsconfig.json                 # TypeScript config — strict, excludes *.old.ts and *.dev.ts
├── biome.json                    # Biome linter/formatter config
├── AGENTS.md                     # Copilot agent instructions
├── PROGRESS.md                   # Session continuity notes
└── README.md                     # Project documentation
```

## Directory Purposes

**`src/`:**
- Purpose: All library source code
- Contains: Entry point, shared types, shared level definitions, dev playgrounds
- Key files: `index.ts` (main entry), `types.ts` (public API types), `levels.ts` (shared level constants)

**`src/logger/`:**
- Purpose: Core logger implementation — the heart of the library
- Contains: Logger factory, singleton registry, option cascading, emit pipeline (prepare → render), scope management, mixin assembly
- Key files: `index.ts` (main implementation, ~640 lines), `types.ts` (internal `LoggerState`), `const.ts` (defaults), `levels.ts` (display config), `dispatch.ts` (`DispatchFn` type)

**`src/logger/prefix/`:**
- Purpose: Structured prefix pipeline — builds semantic metadata, renders to target format
- Contains: Prefix type system, builder, three render targets (browser, TTY, console), two serialisation targets (JSON, logfmt)
- Key files: `types.ts` (6 prefix sub-types), `index.ts` (getPrefix builder), `render.ts` (3 render functions), `serialize.ts` (JSON + logfmt)

**`src/logger/mixins/`:**
- Purpose: Composable behaviors attached to loggers via `Object.assign`
- Contains: Rate limiting, option overrides, spinner system
- Key files: `limit.ts`, `override.ts`

**`src/logger/mixins/spinner/`:**
- Purpose: Animated status indicators with platform-specific rendering
- Contains: Shared state machine, platform factories (browser, console, TTY), constants
- Key files: `index.ts` (mixin entry + factory selector), `sequential.ts` (core timer/state)

**`src/logger/mixins/spinner/browser/`:**
- Purpose: Browser devtools spinner with CSS badges and CSS-gradient progress bars
- Contains: Factory function, platform-specific icon/color constants
- Key files: `index.ts` (`createBrowserSpinner`), `const.ts`

**`src/logger/mixins/spinner/console/`:**
- Purpose: Non-TTY Node spinner (pipe, CI) — ANSI-styled icons, text-based progress bars
- Contains: Factory function, text progress bar builder, platform-specific constants
- Key files: `index.ts` (`createConsoleSpinner`), `const.ts`

**`src/logger/mixins/spinner/tty/`:**
- Purpose: Interactive TTY spinner — real-time animated frames with cursor repositioning
- Contains: TTY spinner factory, full cursor-aware renderer with progress bars
- Key files: `index.ts` (`createTTYSpinner`), `renderer.ts` (`createTTYRenderer`, ~200 lines), `const.ts`

**`src/utils/`:**
- Purpose: Low-level shared helpers — no logger internals, no public API
- Contains: Environment detection, ANSI colour helpers, stack trace parsing
- Key files: `env.ts` (runtime flags), `color.ts` (ANSI colorize), `stack.ts` (call-site capture)

**`src/worker/`:**
- Purpose: Off-thread logging — moves I/O to a dedicated process/worker
- Contains: Main-thread proxy, IPC protocol, worker script, worker-aware rate limiter
- Key files: `index.ts` (public entry, `WL` export), `proxy.ts` (proxy builder), `protocol.ts` (message types), `worker.ts` (message handler), `limit.ts` (worker rate limiter)

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main library entry — `import { Logger } from '@lalex/console'`
- `src/worker/index.ts`: Worker proxy entry — `import { WL } from '@lalex/console/worker'`
- `src/worker/worker.ts`: Worker script — spawned at runtime by the proxy

**Configuration:**
- `rslib.config.ts`: Build config with 3 library entries (main, worker proxy, worker script)
- `rsbuild.config.ts`: Dev server for browser playground
- `tsconfig.json`: TypeScript strict config, excludes `*.old.ts` and `*.dev.ts`
- `biome.json`: Linter and formatter settings
- `package.json`: Dual exports map (`.` and `./worker`)

**Core Logic:**
- `src/logger/index.ts`: Logger factory, emit pipeline, singleton bootstrap
- `src/logger/prefix/render.ts`: All three prefix renderers
- `src/logger/prefix/serialize.ts`: JSON and logfmt serialisers
- `src/logger/mixins/spinner/sequential.ts`: Cross-platform spinner state machine
- `src/logger/mixins/spinner/tty/renderer.ts`: TTY cursor-aware renderer
- `src/worker/proxy.ts`: Full worker proxy builder

**Type Definitions:**
- `src/types.ts`: All public types
- `src/logger/types.ts`: Internal `LoggerState`, re-exports public types
- `src/logger/prefix/types.ts`: `Prefix` union and all sub-types
- `src/logger/dispatch.ts`: `DispatchFn` and `DispatchOptions`
- `src/worker/protocol.ts`: `WorkerMessage` discriminated union

**Dev Playgrounds:**
- `src/play-node.dev.ts`: Node CLI playground (multiple modes: main, worker, logfmt, pretty)
- `src/play-browser.dev.ts`: Browser playground (loaded by rsbuild dev server)

## Naming Conventions

**Files:**
- `kebab-case.ts` for all source files: `play-node.dev.ts`, `index.ts`
- `index.ts` as barrel/entry in every directory
- `const.ts` for constants in each module
- `types.ts` for type definitions
- `*.dev.ts` suffix for dev-only playground files (excluded from build via `tsconfig.json` and `rslib.config.ts`)
- `*.old.ts` suffix for deprecated/legacy files (excluded from build via `tsconfig.json`)

**Directories:**
- `lowercase` for all directories: `logger/`, `utils/`, `worker/`, `mixins/`, `prefix/`
- Platform-specific directories: `browser/`, `console/`, `tty/` under `spinner/`

**Exports:**
- Named exports only — no default exports anywhere
- Singleton instances: `Logger` (alias: `L`), `WL` (worker logger)
- Factory functions: `create*` prefix: `createLogger`, `createSpinnerMixin`, `createLimitMixin`, etc.
- Type naming: PascalCase — `LogMethod`, `RootLogger`, `DispatchFn`, `WorkerMessage`
- Constant naming: UPPER_SNAKE_CASE — `LEVEL_METHODS`, `DEFAULT_LOGGER_OPTIONS`, `STACK_OFFSET`

## Where to Add New Code

**New Log Level:**
- Add entry in `src/levels.ts` → `LEVEL_METHODS` object
- Add display entry in `src/logger/levels.ts` → `LEVEL_DISPLAY` object
- Types auto-derive from `LEVEL_METHODS` — no manual type changes needed

**New Output Format (e.g. YAML, TOML):**
- Add serialiser in `src/logger/prefix/serialize.ts`
- Add format literal to `RootLogger['format']` union in `src/types.ts`
- Add branch in `emitConsole()` in `src/logger/index.ts`

**New Mixin (e.g. sampling, batching):**
- Create file in `src/logger/mixins/`: `src/logger/mixins/{name}.ts`
- Export `create{Name}Mixin(dispatch: DispatchFn)` returning the mixin object
- Wire in `createLogger()` and `createScopeLogger()` in `src/logger/index.ts`

**New Spinner Platform:**
- Create directory under `src/logger/mixins/spinner/{platform}/`
- Add `index.ts` with `create{Platform}Spinner()` matching the factory signature
- Add `const.ts` with platform-specific icons/colors/intervals
- Register in `selectSpinnerFactory()` in `src/logger/mixins/spinner/index.ts`

**New Utility:**
- Add to `src/utils/` — file per concern
- Import directly by path (no barrel re-export from `src/utils/index.ts`)

**New Prefix Type:**
- Add variant to the `Prefix` union in `src/logger/prefix/types.ts`
- Handle in all three render functions in `src/logger/prefix/render.ts`
- Handle in `extractFields()` in `src/logger/prefix/serialize.ts`

**New Worker Message Type:**
- Add variant to `WorkerMessage` union in `src/worker/protocol.ts`
- Handle in `handle()` switch in `src/worker/worker.ts`
- Send from proxy in `src/worker/proxy.ts`

## Special Directories

**`dist/`:**
- Purpose: Build output — ESM bundles + declaration files
- Generated: Yes (by `rslib build`)
- Committed: No (listed in `package.json` `files` for npm publish only)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD commands)
- Committed: Yes

**`src/logger/mixins/spinner/browser/`, `console/`, `tty/`:**
- Purpose: Platform-specific spinner implementations — each has an `index.ts` factory and a `const.ts` with icons/colors
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-24*

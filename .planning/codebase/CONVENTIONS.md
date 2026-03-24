# Coding Conventions

**Analysis Date:** 2026-03-24

## TypeScript Configuration

**Strict mode:** Enabled — `strict: true` in `tsconfig.json`.

**Target/Module:**
- `target`: ES2018
- `module`: ESNext
- `moduleResolution`: bundler
- `lib`: DOM, ES2022

**Key flags:**
- `isolatedModules: true`
- `skipLibCheck: true`
- `allowImportingTsExtensions: true`
- `noEmit: true` (Rslib handles emit)

**Excluded from compilation:** `src/**/*.old.ts`, `src/**/*.dev.ts`

## Naming Patterns

**Files:**
- `kebab-case.ts` — all source files use lowercase kebab-case
- `index.ts` — barrel files for module entry points
- `*.dev.ts` — development playground scripts (excluded from build)
- `*.old.ts` — deprecated code kept for reference (excluded from build)
- `const.ts` — module-scoped constants
- `types.ts` — module-scoped type definitions

**Functions:**
- `camelCase` — all functions: `createLogMethod`, `computeOptions`, `getPrefix`, `serializeJSON`
- Factory pattern: `create*` prefix for constructor-like functions: `createCoreLogger`, `createScopeLogger`, `createLimitMixin`, `createSpinnerMixin`, `createBrowserSpinner`, `createSequentialSpinner`
- Getters: `get*` prefix: `getPrefix`, `getDatePrefix`, `getLogCallerInfo`, `getCallerStackTrace`
- Boolean-returning helpers: `is*` or `has*` prefix: `isNode`, `isBrowser`, `isNodeTTY`

**Variables:**
- `camelCase` for locals and parameters
- `UPPER_SNAKE_CASE` for module-level constants: `LEVEL_METHODS`, `STACK_OFFSET`, `DEFAULT_LOGGER_OPTIONS`, `SPINNER_INTERVAL_JITTER`
- Underscore-prefixed `_camelCase` for module-level mutable state: `_captureStack`, `_enabled`, `_terminateTransport`

**Types:**
- `PascalCase` for all types: `LogLevel`, `LoggerOptions`, `SpinnerState`, `DispatchFn`
- Suffix `Fn` for function type aliases: `DispatchFn`, `ConsoleFn`, `SpinnerRenderFn`, `SendFn`, `LimitSendFn`
- Suffix `Options` for option bags: `LoggerOptions`, `SpinnerOptions`, `ExecOptions`, `PrefixOptions`, `DispatchOptions`
- Suffix `State` for internal state types: `LoggerState`, `SpinnerState`

## Type Definition Conventions

**`interface` for public API object shapes:**
- `LoggerSpinner`, `Logger`, `RootLogger`, `ScopeLogger` in `src/types.ts`
- Used for shapes that represent runtime objects with methods

**`type` for everything else:**
- Union types: `Prefix`, `WorkerMessage`, `LogLevel`
- Simple object shapes: `LogLevelStyle`, `SpinnerOptions`, `TextPrefix`
- Function signatures: `DispatchFn`, `SpinnerRenderFn`
- Mapped types: `LogLevelDisplay`, `LogLevelParam`

**Discriminated unions for variant types:**
- `Prefix` union in `src/logger/prefix/types.ts` discriminated by `type` field
- `WorkerMessage` union in `src/worker/protocol.ts` discriminated by `type` field

**`as const` for immutable object literals:**
- `LEVEL_METHODS` in `src/levels.ts`
- Console method maps in `src/logger/index.ts`

**`satisfies` for type-checked object literals with inferred narrower types:**
- Logger registry initialisation in `src/logger/index.ts`
- ANSI color palette in `src/utils/color.ts`

**`import type` for type-only imports:**
- Consistently used throughout: `import type { LogLevel } from './types'`
- Separates value imports from type imports in all files

## Export Conventions

**Named exports only — no default exports anywhere in the codebase.**

**Re-exports via barrel files:**
- `src/index.ts` → `export * from './logger'`
- `src/logger/prefix/index.ts` → `export type { DatePrefix, IconPrefix, ... } from './types'`
- `src/logger/types.ts` → `export * from '../types'` (re-exports public types)
- `src/logger/index.ts` → `export { LogLevels } from '../levels'`

**Export granularity:**
- Public API: re-exported through barrel chain up to `src/index.ts`
- Internal utilities: exported from their own module but NOT re-exported to the public barrel
- Examples: `src/utils/color.ts` exports `colorize` but it never reaches `src/index.ts`

**Dual entry points:**
- `@lalex/console` → `src/index.ts` → logger + types
- `@lalex/console/worker` → `src/worker/index.ts` → worker proxy

## Code Style

**Formatting (Biome):**
- Indent style: spaces
- Quote style: single quotes
- Organise imports: enabled (`source.organizeImports: "on"`)
- Linter: recommended rules

**Functional style:**
- Pure functions preferred: `computeOptions`, `colorize`, `getPrefix`, `parseFrame`
- Factory functions returning closures over private state: `createLimitMixin`, `createSpinnerMixin`, `createOverrideMixin`
- Immutable data: `as const` on constant objects, spread copies for option merging
- No classes — the entire codebase is class-free; object composition via `Object.assign`

**Early returns:**
- Guard clauses at function top: null checks, enabled checks, level filtering
- See `prepareLog` in `src/logger/index.ts` — multiple early `return null` guards

**Closures over classes:**
- Logger state captured in closures rather than `this` bindings
- `createCoreLogger` declares `let self!: RootLogger | ScopeLogger` and captures it in all method closures
- Mixin functions (`createLimitMixin`, `createOverrideMixin`) return plain objects with closure-captured state

**Object composition via `Object.assign`:**
- Logger objects are built incrementally: `Object.assign(self, override, limited, spinner, { scope })`
- Spinners attach `.spin()` and `.exec()` to existing function objects via `Object.assign(fn, { spin, exec })`

## Import Organization

**Order (enforced by Biome `organizeImports`):**
1. Node built-ins: `import { env as processEnv } from 'node:process'`
2. External packages (none at runtime — zero dependencies)
3. Internal absolute/relative imports: `import { LEVEL_METHODS } from '../levels'`
4. Type-only imports separated: `import type { LoggerOptions } from './types'`

**Path conventions:**
- No path aliases — all imports use relative paths
- `node:` prefix for Node built-ins: `node:process`, `node:util`

## Error Handling

**try/catch with specific handling:**
- `emit` in `src/logger/index.ts`: wraps the entire log output path, falls back to `console.error`
- `utilInspect` lazy loader in `src/utils/env.ts`: catches require failure, returns `undefined`
- Spinner `makeExecFn` in `src/logger/mixins/spinner/index.ts`: catches promise rejection, marks spinner as failed, re-throws

**Fallback patterns:**
- `structuredClone` → `String()` → `'[unserializable]'` chain in `src/worker/limit.ts`
- Optional chaining for nullable access: `process?.versions?.node`, `(e as Error).stack?.split('\n')`
- Nullish coalescing for defaults: `options.duration ?? false`, `config.optimization ??= {}`

**No silent catches:** every catch block either returns a fallback, re-throws, or logs.

## Comment Conventions

**Language:** English only.

**Block-level JSDoc headers on all exported and significant internal functions:**
- Purpose, parameter descriptions, return value semantics
- Example: `getLogCallerInfo`, `createSequentialSpinner`, `terminateWorker` in `src/worker/proxy.ts`

**Inline comments for non-obvious decisions (the "why"):**
- Stack frame numbering documented with frame-by-frame breakdown: `src/utils/stack.ts`
- `biome-ignore` suppressions always include an explanation: `// biome-ignore lint/suspicious/noExplicitAny: union key — value types are compatible per-key at runtime`

**Section separators:**
- `// ── Section Name ──────────────────────` pattern used throughout for visual grouping
- Consistent in all major files: `src/logger/index.ts`, `src/worker/proxy.ts`, `src/logger/prefix/types.ts`

## `any` Usage Policy

**`any` is prohibited by convention.** `unknown` is used when types cannot be narrowed.

**Exceptions:** `biome-ignore lint/suspicious/noExplicitAny` is used in ~13 locations where dynamic property assignment or console method shapes make strict typing impractical. Every suppression includes an explanation:
- Dynamic key assignment on typed objects: `(computed as any)[key] = layer[key]`
- Console methods that share shape but have divergent TS types
- Dynamic level method creation via loop: `(result as unknown as Record<string, unknown>)[level] = fn`

## Module Design

**One module = one concern:**
- `src/levels.ts` — level definitions only
- `src/utils/env.ts` — environment detection only
- `src/utils/stack.ts` — stack introspection only
- `src/utils/color.ts` — ANSI colorization only

**Mixin pattern for composable features:**
- `src/logger/mixins/limit.ts` — rate limiting mixin
- `src/logger/mixins/override.ts` — option override mixin
- `src/logger/mixins/spinner/` — spinner mixin with platform-specific implementations

**Platform-specific implementations via directory structure:**
- `src/logger/mixins/spinner/browser/` — browser spinner
- `src/logger/mixins/spinner/console/` — non-TTY console spinner
- `src/logger/mixins/spinner/tty/` — TTY spinner with ANSI renderer

**Shared core + platform branches:**
- `src/logger/mixins/spinner/sequential.ts` — shared timing/lifecycle logic
- Platform directories provide `create*Spinner` factories with platform-specific rendering

## Globals and Singletons

**Registry singleton on `globalThis`:**
- `src/logger/index.ts` uses `globalThis['$logger-registry']` to survive duplicate module loads
- Ensures a single logger instance even with CJS + ESM dual-load

**Module-level mutable state:**
- Worker proxy in `src/worker/proxy.ts` uses module-level `let` variables to mirror logger options
- Justified by the proxy being a singleton; documented with comments

---

*Convention analysis: 2026-03-24*

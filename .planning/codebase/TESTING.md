# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:** None.

No test framework is installed or configured. There are no test runner dependencies in `package.json` (no vitest, jest, mocha, node:test, or any other test library). No test configuration files exist (`vitest.config.*`, `jest.config.*`, etc.).

**No test script:** `package.json` has no `test` script defined.

## Test File Organization

**No test files exist.** A recursive search for `*.test.*`, `*.spec.*`, and `__tests__/` directories found zero matches in `src/`.

## Manual Testing Infrastructure

The project uses **playground scripts** for manual verification instead of automated tests:

**Node playgrounds:**
- `src/play-node.dev.ts` — Node.js playground (excluded from build via `*.dev.ts` glob)
- Scripts in `package.json`:
  - `play:node` — main-thread mode
  - `play:node:logfmt` — logfmt output format
  - `play:node:pretty` — pretty output format
  - `play:node:worker` — worker mode
  - `play:node:worker:logfmt` — worker + logfmt
  - `play:node:worker:pretty` — worker + pretty
  - `play:tty` — TTY mode with `--watch`
  - `play:tty:worker` — TTY worker mode with `--watch`

**Browser playgrounds:**
- `src/play-browser.dev.ts` — browser playground (served via Rsbuild dev server)
- Scripts in `package.json`:
  - `play:browser` — browser main-thread mode
  - `play:browser:worker` — browser worker mode (via `PLAY_MODE=worker` env var)

**Runtime:** `tsx` for Node playgrounds, `@rsbuild/core` dev server for browser playgrounds.

## Coverage

**No coverage tooling.** No coverage configuration, thresholds, or reporting.

## CI/CD

**GitHub Actions:** `.github/workflows/release.yaml`
- Trigger: push of version tags (`v*.*.*`, `v*.*.*-*`)
- Job: release and publish to npm via `lalexdotcom/action-release-and-publish@v1`
- **No CI test step** — the release pipeline does not run tests or linting

**Dependabot:** `.github/dependabot.yml` — configured for dependency updates.

## Static Analysis (in lieu of tests)

**Biome:** configured in `biome.json`
- Linting: recommended rules enabled
- Formatting: space indent, single quotes
- Import organising: enabled
- Run via: `pnpm run check` (check + auto-fix) or `pnpm run format` (format only)

**TypeScript compiler:**
- `strict: true` catches type errors at compile time
- `noEmit: true` — type-checking only (Rslib handles output)
- Build command: `pnpm run build` (via Rslib)

## Test Types

**Unit Tests:** Not present.
**Integration Tests:** Not present.
**E2E Tests:** Not present.

## Where to Add Tests

If adding a test framework, the recommended setup based on the project's tooling (ESM, TypeScript, Rslib) would be:

**Test files:**
- Co-located: `src/logger/index.test.ts` next to `src/logger/index.ts`
- Or dedicated directory: `tests/` at project root

**Key areas to test:**
- `computeOptions` layer cascading logic (`src/logger/index.ts`)
- `getPrefix` and prefix rendering (`src/logger/prefix/`)
- `serializeJSON` / `serializeLogfmt` output (`src/logger/prefix/serialize.ts`)
- Level filtering and severity comparison (`src/levels.ts`)
- Rate-limiting mixin (`src/logger/mixins/limit.ts`)
- Stack introspection helpers (`src/utils/stack.ts`)
- `colorize` ANSI output (`src/utils/color.ts`)
- Worker message protocol serialisation (`src/worker/protocol.ts`)

---

*Testing analysis: 2026-03-24*

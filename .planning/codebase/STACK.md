# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.9.3 — All source code (`src/**/*.ts`)

**Secondary:**
- JSON — Configuration files (`package.json`, `tsconfig.json`, `biome.json`)
- YAML — Workspace config (`pnpm-workspace.yaml`)

## Runtime

**Environment:**
- Node.js 22.x (dev container provides v22.16.0)
- Browser (main thread and Web Workers)

**Package Manager:**
- pnpm 10.11.0 (declared via `packageManager` field in `package.json`)
- Lockfile: `pnpm-lock.yaml` present

**No `.nvmrc` or `.node-version` file detected.** Node version is inherited from the dev container.

## Frameworks

**Core:**
- No application framework — this is a standalone logging library (`@lalex/console` v2.0.0)

**Build:**
- Rslib `^0.20.0` — Library build tool (ESM output with DTS generation). Config: `rslib.config.ts`
- Rsbuild `^1.7.3` — Dev server for browser playground. Config: `rsbuild.config.ts`
- Rspack — Underlying bundler used by Rslib/Rsbuild (configured via `tools.rspack` in `rslib.config.ts`)

**Dev Tooling:**
- tsx `^4.21.0` — TypeScript execution for Node.js playground scripts
- Biome `2.4.7` — Linting and formatting (replaces ESLint + Prettier). Config: `biome.json`

**Testing:**
- No test framework detected. No test files, no test config, no test scripts in `package.json`.

## Key Dependencies

**Production:**
- **Zero runtime dependencies** — The library has no `dependencies` field in `package.json`. It is entirely self-contained.

**Dev Dependencies:**
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

The library uses Node.js built-ins directly (no npm packages):
- `node:util` — `InspectOptions` type, `inspect()` (lazy-loaded), `stripVTControlCharacters()`
- `node:process` — `env`, `process.stdout.isTTY`, `process.argv`
- `child_process` — `fork()` for worker transport (dynamic import in `src/worker/proxy.ts`)

## Build Configuration

### Rslib (`rslib.config.ts`)

Three library entries compiled to ESM with `node 18` syntax target:

| Entry | Source | Output | DTS |
|-------|--------|--------|-----|
| Main (`@lalex/console`) | `src/index.ts` | `dist/index.js` | Yes |
| Worker proxy (`@lalex/console/worker`) | `src/worker/index.ts` | `dist/worker/index.js` | Yes |
| Worker script (runtime) | `src/worker/worker.ts` | `dist/worker/worker.js` | No |

Key Rspack overrides:
- `optimization.chunkIds = 'named'` — Human-readable chunk names
- `output.chunkFilename = '[name].js'` — Named chunk output
- `source.exclude: [/\.dev\.ts$/]` — Excludes playground files from build
- `source.define.__WORKER_SCRIPT__` — Compile-time constant for worker script path

### Rsbuild (`rsbuild.config.ts`)

Browser development server for playground:
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

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./worker": {
    "types": "./dist/worker/index.d.ts",
    "import": "./dist/worker/index.js"
  }
}
```

ESM-only — no CJS output.

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

**Development:**
- Node.js 18+ (syntax target)
- pnpm 10.11.0+
- Dev container based on Debian GNU/Linux 12 (bookworm)

**Production (consumers):**
- Node.js 18+ (ESM, `node:` imports)
- Any modern browser with ES2018 support and Web Worker API
- ESM-only — no CommonJS fallback

---

*Stack analysis: 2026-03-24*

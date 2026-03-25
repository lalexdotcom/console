---
phase: 06
phase_name: browser-compat-build
created: 2026-03-25
mode: auto
---

# Phase 06: Browser Compatibility & Build Validation — Context

## Phase Goal

Browser-only consumers can bundle `@lalex/console` (main entry) without `node:*` errors;
`package.json` exports map has a `"browser"` condition; `dist/` shape matches every
`exports` entry including DTS files.

## Canonical Refs

- `.planning/REQUIREMENTS.md` — BROWSER-01, BROWSER-02, BROWSER-03, BUILD-01, BUILD-02, BUILD-03
- `.planning/ROADMAP.md` — Phase 06 success criteria
- `.planning/PROJECT.md` — core value, browser support context
- `rslib.config.ts` — current build configuration (3 lib entries: main, worker proxy, worker script)
- `package.json` — exports map (`.` and `./worker` entries only, no `"browser"` condition yet)
- `src/utils/env.ts` — contains top-level `import { env as processEnv } from 'node:process'` (MUST FIX)
- `src/logger/mixins/spinner/tty/renderer.ts` — contains `import { stripVTControlCharacters } from 'node:util'` (MUST FIX)

## Codebase Context

### Node: imports in the main bundle path
Two top-level `node:` imports currently in the main entry's dependency tree:

1. `src/utils/env.ts:1` — `import { env as processEnv } from 'node:process'`
   - Used only as: `processEnv.LLOGER_FORCE_CONSOLE` and `export const env = isNode ? processEnv : {}`
   - Fix: replace with `const processEnv = typeof process !== 'undefined' ? (process.env ?? {}) : {}` (no import)

2. `src/logger/mixins/spinner/tty/renderer.ts:1` — `import { stripVTControlCharacters } from 'node:util'`
   - Used to clean ANSI sequences from text before width computation
   - Fix: inline with regex (removes ANSI/VT control sequences; identical behaviour)

### Worker proxy node: imports (NOT main-bundle path)
`src/worker/index.ts`: `node:child_process`, `node:path`, `node:url` — ONLY in `/worker` entry, not in main.
These are NOT a concern for BROWSER-01/BROWSER-03 (main entry scope).

### Existing rslib.config.ts structure
- `lib[0]`: main entry, `format: 'esm'`, `syntax: 'node 18'`, `dts: true` → `dist/index.js` + `dist/index.d.ts`
- `lib[1]`: worker proxy entry → `dist/worker/index.js` + `dist/worker/index.d.ts`
- `lib[2]`: worker script → `dist/worker/worker.js`

### Existing package.json exports
```json
".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
"./worker": { "types": "./dist/worker/index.d.ts", "import": "./dist/worker/index.js" }
```
No `"browser"` condition. `dist/` not committed (build artifact).

## Decisions

### Decision 1 — Source fixes before browser build
[auto] Fix source code to remove all top-level `node:` imports from the main entry dependency tree.
This is correct: library source should not force consumers to polyfill built-ins.

- `src/utils/env.ts`: Remove `import { env as processEnv } from 'node:process'` → use conditional global access
- `src/logger/mixins/spinner/tty/renderer.ts`: Remove `import { stripVTControlCharacters } from 'node:util'` → inline regex

### Decision 2 — Dedicated browser lib entry in rslib.config.ts
[auto] Add a fourth lib entry (`lib[3]`) targeting browsers:
- Same source entry (`src/index.ts`) as lib[0]
- `format: 'esm'`, `syntax: 'es2020'` (modern browsers)
- `dts: false` — browser entry shares DTS with lib[0] (same types)
- `output.distPath.root: './dist/browser'` → produces `dist/browser/index.js`

Rationale: Separate artifact makes it easy to verify browser-safety independently.
Consumers get `"browser"` → `dist/browser/index.js` and can bundle without node: errors.

### Decision 3 — package.json exports "browser" condition
[auto] Add `"browser"` condition for the main entry (`.`) pointing to `dist/browser/index.js`.
Standard ordering: `types` first, then `browser`, then `import`.

```json
".": {
  "types": "./dist/index.d.ts",
  "browser": "./dist/browser/index.js",
  "import": "./dist/index.js"
}
```

The `/worker` entry deliberately omits `"browser"` — it requires Node fork/IPC and is Node-only by design.

### Decision 4 — Build validation approach
[auto] Run `pnpm run build` and verify `dist/` integrity:
- Check every path declared in the exports map has a corresponding file in `dist/`
- Verify DTS files are present at expected paths
- Run `tsc --noEmit` for type correctness (already passing after Phase 05)
- Browser build validation: confirm `grep -r 'node:child_process\|node:path\|node:url' dist/browser/index.js` returns no matches

### Decision 5 — No node-polyfill plugin in lib build
[auto] Do NOT use `@rsbuild/plugin-node-polyfill` in the rslib config.
Polyfilling in a library is bad practice — consumers should control polyfilling.
The source fixes ensure no `node:*` imports remain in the browser bundle path.

## Out of Scope

- Worker proxy browser compatibility — `./worker` is intentionally Node-only
- WASM / Service Worker support — not in v3.0.0 requirements
- CJS build — project is ESM-only (`"type": "module"`)
- Separate browser entry for spinner/TTY renderer tree-shaking beyond what source fixes provide

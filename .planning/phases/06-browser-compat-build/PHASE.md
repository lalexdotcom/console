# Phase 06: Browser Compatibility & Build Validation

**Milestone:** v3.0.0 Consolidation
**Goal:** Browser-only consumers can bundle `@lalex/console` without `node:*` errors; `package.json` exports map has a `"browser"` condition for the main entry; `dist/` shape matches every `exports` entry including DTS files.

## Requirements Covered

- **BROWSER-01**: A browser-only consumer can bundle `@lalex/console` (main entry) without `node:*` import errors
- **BROWSER-02**: `package.json` `exports` map exposes a `"browser"` condition for the main entry that excludes Node-only code paths
- **BROWSER-03**: Tree-shaking verified — the browser bundle contains no `node:child_process`, `node:path`, `node:url` references
- **BUILD-01**: `dist/` structure matches all `exports` entries in `package.json` (runtime + types)
- **BUILD-02**: DTS output is present and correct for all public entry points
- **BUILD-03**: `pnpm run build` exits cleanly with no errors or warnings

## Success Criteria

1. A Rsbuild browser-target build that imports `@lalex/console` completes without any unresolved `node:*` module errors
2. `package.json` `exports` map contains a `"browser"` condition for the main entry pointing to a build artifact that excludes Node-only code paths
3. `grep -r 'node:child_process\|node:path\|node:url' dist/index.js` returns no matches (those symbols are tree-shaken from the browser output)
4. Every path declared in the `exports` map has a corresponding file in `dist/`; no extra unreferenced artifacts exist under `dist/`
5. DTS output is present at every path declared under `"types"` conditions in `exports`
6. `pnpm run build` exits with code 0 and zero warnings
7. `tsc --noEmit` passes with zero errors

## Key Technical Notes

### Why `node:*` leaks into browser builds

`src/worker/index.ts` contains a dynamic `import('node:child_process')` inside `createNodeTransport`. Even though it is guarded by an `_isNode` runtime check, static bundlers (Webpack/Rspack in browser mode) still attempt to resolve the import specifier at build time. The dynamic import pattern prevents successful tree-shaking in browser-targeted builds.

### Approach: `"browser"` exports condition

Add a `"browser"` condition to the main entry in `package.json`:

```json
".": {
  "types": "./dist/index.d.ts",
  "browser": "./dist/browser/index.js",
  "import": "./dist/index.js"
}
```

A new Rslib lib entry builds the browser-safe variant with `target: 'web'`, which causes Rspack to mark `node:*` imports as dead code or externals and omit them from the output.

### `/worker` entry and browser

The `/worker` entry intentionally contains Node-specific code (`fork`) and a Web Worker fallback. Browser consumers that need the worker proxy should import `@lalex/console/worker` and rely on the Web Worker code path — no special `"browser"` condition is required for this entry because the dynamic import of `node:child_process` is already behind the `_isNode` guard and the browser transport does not import Node built-ins.

If linter/bundler warnings arise for the `/worker` entry in browser mode, a `"browser"` condition pointing at the same artifact (or a dedicated browser-only variant) can be added — document the decision.

### Build validation checklist

After `pnpm run build`, verify manually:

```
dist/
  index.js         ← @lalex/console (Node)
  index.d.ts       ← types for @lalex/console
  browser/
    index.js       ← @lalex/console (browser condition)
  worker/
    index.js       ← @lalex/console/worker
    index.d.ts     ← types for @lalex/console/worker
    worker.js      ← worker script chunk
```

Each `dist/` path must exist or the exports map entry that references it is broken.

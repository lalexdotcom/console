---
quick_id: 260512-kcn
date: 2026-05-12
status: complete
---

# Quick Task 260512-kcn: Publier en mode bundle:false en ESM pur

## What Was Changed

**File:** `rslib.config.ts`

Three lib entries received `bundle: false`:

| Entry  | Change                                                          |
| ------ | --------------------------------------------------------------- |
| lib[0] | Added `bundle: false` + glob `entry: { index: ['src/**', '!src/**/*.dev.ts'] }` |
| lib[1] | Added `bundle: false` (already had explicit single-file entry)  |
| lib[2] | **Unchanged** — worker script must stay bundled                 |
| lib[3] | Added `bundle: false` + same glob exclusion as lib[0]           |

## Deviation: Glob Entry Required for lib[0] and lib[3]

**Rule 3 — Blocking Issue**

Simply adding `bundle: false` without an explicit entry caused build failures for lib[0] and lib[3]. Root cause:

- In bundleless mode without an explicit entry, Rslib defaults to scanning `src/**` (discovered by reading `composeEntryConfig` in `@rslib/core/dist/index.js`).
- `source.exclude: [/\.dev\.ts$/]` at root level only excludes files from the **SWC/TS loader** transform — it does NOT prevent files from being discovered in the bundleless file scan.
- `play-browser.dev.ts` and `play-node.dev.ts` were discovered, skipped by the TS loader, and then Rspack attempted to parse them as raw JavaScript → parse errors.

**Fix applied:** Instead of the default `src/**` scan, an explicit glob entry with negation was added:
```ts
source: {
  entry: { index: ['src/**', '!src/**/*.dev.ts'] },
}
```
This is passed directly to `tinyglobby` (Rslib's internal glob engine), which properly excludes `.dev.ts` files from file discovery entirely.

lib[1] was unaffected because it already had an explicit single-file entry (`./src/worker/index.ts`), which Rslib processes without scanning the directory.

## Build Result

```
35 files generated in dist,         total: 88.4 kB  (esm0 — main)
 1 files generated in dist/worker,  total: 16.7 kB  (esm1 — worker proxy)
50.4 kB in dist/worker/worker.js                    (esm2 — worker script, bundled)
35 files generated in dist/browser, total: 88.4 kB  (esm3 — browser)
```

`pnpm run build` exits with code **0**.

Output structure: each source module is now a separate file (one-to-one transform), imports are preserved as relative ESM paths. lib[2] (worker script) remains a self-contained bundle.

## Commit

`b0a4d8c` — `chore(260512-kcn): add bundle:false to lib[0], lib[1], lib[3] in rslib.config.ts`

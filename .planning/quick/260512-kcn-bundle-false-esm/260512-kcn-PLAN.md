---
quick_id: 260512-kcn
description: "Publier en mode bundle:false en ESM pur"
date: 2026-05-12
must_haves:
  truths:
    - rslib.config.ts lib[0] (main) has bundle: false
    - rslib.config.ts lib[1] (worker proxy) has bundle: false
    - rslib.config.ts lib[3] (browser) has bundle: false
    - rslib.config.ts lib[2] (worker script) remains bundled (no bundle property)
    - pnpm run build exits with code 0
---

# Quick Task 260512-kcn: Publier en mode bundle:false en ESM pur

## Objective

Add `bundle: false` to the three library distribution entries in `rslib.config.ts` so that
each source file is compiled individually (one-to-one transform) instead of being merged into
a single bundle. The worker script entry (lib[2]) stays bundled because it must be a
self-contained executable forked at runtime.

## Context

- `bundle: false` = Rslib transpiles each source file independently; imports are preserved
  as relative ESM imports in the output, matching the source graph exactly.
- lib[0] (main, `dist/index.js`): public library entry — benefits from unbundled mode.
- lib[1] (worker proxy, `dist/worker/index.js`): public proxy entry — same rationale.
- lib[2] (worker script, `dist/worker/worker.js`): standalone runtime script, MUST stay bundled.
- lib[3] (browser, `dist/browser/index.js`): public browser entry — unbundled is fine since
  the source is already clean of Node-only imports after Phase 6.
- The root-level `tools.rspack` (chunkIds, chunkFilename) is kept because lib[2] is still
  bundled and may produce dynamic chunks.

## Task 1 — Add bundle: false to the three public lib entries

**File:** `rslib.config.ts`

**Action:**
- Add `bundle: false` to lib[0] (main ESM entry)
- Add `bundle: false` to lib[1] (worker proxy ESM entry)
- Add `bundle: false` to lib[3] (browser ESM entry)
- Leave lib[2] (worker script) unchanged

**Verify:** `pnpm run build` exits with code 0, `dist/` still contains expected paths

**Done:** `rslib.config.ts` updated, build succeeds

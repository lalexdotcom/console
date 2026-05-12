---
quick_id: 260512-kzn
description: "Nettoyer dist/ - supprimer src/ et tests/"
date: 2026-05-12
must_haves:
  truths:
    - dist/index.d.ts exists (not dist/src/index.d.ts)
    - dist/worker/index.d.ts exists
    - dist/src/ directory does not exist
    - dist/tests/ directory does not exist
    - pnpm run build exits with code 0
---

# Quick Task 260512-kzn: Nettoyer dist/ — supprimer src/ et tests/

## Problem

In bundleless mode (`bundle: false`), Rslib delegates `.d.ts` generation to `tsc`.
Because `tsconfig.json` includes both `src/` and `tests/`, TypeScript computes the
implicit `rootDir` as the workspace root. This causes `.d.ts` files to be emitted as
`dist/src/index.d.ts` instead of `dist/index.d.ts`, and `dist/tests/...` side-effects.

The JS output is already correct (`dist/index.js`) because Rslib uses the lowest common
ancestor of the glob entry (`src/**`) as the outBase automatically.

## Solution

Use `dts: { bundle: true }` for lib[0] and lib[1]. With bundled DTS, Rslib hands off
to `@microsoft/api-extractor` which starts from the explicit entry point and produces a
single, clean declaration file per entry — with no rootDir ambiguity:

- lib[0] → `dist/index.d.ts`
- lib[1] → `dist/worker/index.d.ts`

No `dist/src/`, no `dist/tests/`.

**Note:** `dts.bundle` is independent from `lib.bundle`. JS stays unbundled (one file per
source), DTS is bundled (one `.d.ts` per entry). This is the canonical Rslib approach.

## Task 1 — Install @microsoft/api-extractor

```bash
pnpm add -D @microsoft/api-extractor
```

**Done:** `@microsoft/api-extractor` present in `package.json` devDependencies

## Task 2 — Switch lib[0] and lib[1] to dts: { bundle: true }

**File:** `rslib.config.ts`

**Changes:**
- lib[0]: `dts: true` → `dts: { bundle: true }`
- lib[1]: `dts: true` → `dts: { bundle: true }`

**Verify:**
- `pnpm run build` exits 0
- `dist/index.d.ts` exists
- `dist/worker/index.d.ts` exists
- `dist/src/` does NOT exist
- `dist/tests/` does NOT exist

**Done:** build clean, no `dist/src/` or `dist/tests/`

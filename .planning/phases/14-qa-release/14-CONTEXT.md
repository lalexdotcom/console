# Phase 14: QA + Release — Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate that all quality gates pass after the Phase 13 directory restructure, and tag
the milestone as a release candidate:
- QA-01: Migration checklist — every pre-migration test has a post-migration equivalent
- QA-02: `tsc --noEmit` exits clean (already passing)
- QA-03: `pnpm run check` (Biome) exits clean — currently 6 errors + 36 warnings to fix
- VERSION-03: `package.json` version set to exactly `3.0.2-rc.0`

No new tests or features are added in this phase.

</domain>

<decisions>
## Implementation Decisions

### Migration audit (QA-01)
- **D-01:** Aggregate the SUMMARY.md files from phases 12 and 13 to build the migration
  checklist. Those summaries already list which files were deleted and which new
  `index.test.ts` files were created to replace them. No separate script or manual audit
  is needed — the GSD summaries are the authoritative record.
- **D-02:** Produce a `MIGRATION-AUDIT.md` in the phase directory that cross-references
  each deleted test file against the new `index.test.ts` that covers it, plus the Phase 13
  D-01/D-02 decisions as explicit validation for intentional deletions.

### Biome check (QA-03)
- **D-03:** Use `pnpm run check` (the existing `check` script calls `biome check --write`).
  This handles both lint and format in one pass. The `lint` alias does not need to be added;
  ROADMAP references to `pnpm run lint` should be interpreted as `pnpm run check`.
- **D-04:** All 6 Biome errors and 36 warnings must be resolved before the version bump.
  Run `pnpm run check` to see the full diagnostic; fix errors first, then address warnings.

### tsc check (QA-02)
- **D-05:** `tsc --noEmit` already passes (0 errors) and the existing `tsconfig.json`
  already includes both `src/` and `tests/` in its `include` array. No tsconfig changes
  needed. Running `npx tsc --noEmit` or `pnpm exec tsc --noEmit` is sufficient.

### Version bump (VERSION-03)
- **D-06:** Edit `package.json` directly — set `"version"` to `"3.0.2-rc.0"` once all
  other quality gates pass. Do not use the interactive `pnpm run version` (upversion).
  The bump happens last in the phase so the RC tag signals a fully-verified state.

### Agent's Discretion
- Order of gate execution: fix Biome first (most work), confirm tsc, run all tests,
  then bump version last.
- Biome safe-fix mode only (`biome check --write` without `--unsafe`) — the `check`
  script already runs in write mode; no unsafe coercions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase summaries (migration audit source)
- `.planning/phases/12-suite-migration/` — SUMMARY files listing deleted/created files
- `.planning/phases/13-directory-restructure/13-P01-SUMMARY.md` — deleted node test files
- `.planning/phases/13-directory-restructure/13-P02-SUMMARY.md` — console dirs created
- `.planning/phases/13-directory-restructure/13-P03-SUMMARY.md` — tty/browser dirs created
- `.planning/phases/13-directory-restructure/13-P04-SUMMARY.md` — rstest config + cleanup
- `.planning/phases/13-directory-restructure/13-CONTEXT.md` — decisions D-01/D-02/D-05 (explicit validation of deletions)

### Requirements
- `.planning/REQUIREMENTS.md` §QA-01, §QA-02, §QA-03, §VERSION-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Quality gate state (as of 2026-03-30)
- `tsc --noEmit`: ✅ 0 errors — `tsconfig.json` covers `src/` + `tests/`
- `pnpm run test`: ✅ 520 tests pass (11 test files)
- `pnpm run check`: ❌ 6 errors, 36 warnings, 165 infos — needs fixing
- `pnpm run build`: ✅ 0 errors

### Version
- Current `package.json` version: needs verification (target: `3.0.2-rc.0`)

### Integration Points
- `package.json` — version field to edit for VERSION-03
- `biome.json` — Biome configuration (do not change rules, only the source code)

</code_context>

<specifics>
## Specific Ideas

- The migration audit should produce a `MIGRATION-AUDIT.md` document that can serve
  as a permanent record for future maintainers to understand which legacy test files
  were consolidated and why.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-qa-release*
*Context gathered: 2026-03-30*

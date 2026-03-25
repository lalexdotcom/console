# Phase 07: Test Cleanup & Release Prep - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** --auto (all decisions auto-selected)

<domain>
## Phase Boundary

Remove the two smoke test files, document the custom test helpers audit result, and bump `package.json` to `3.0.0-rc.0`. This is the final phase of the v3.0.0 "Consolidation" milestone.

No new test infrastructure is added here — that is deferred to a future milestone (BATTERY-01..07, TEST-03..05).

</domain>

<decisions>
## Implementation Decisions

### Smoke Test Removal

- **D-01:** Delete `tests/node/main/smoke.test.ts` and `tests/browser/main/smoke.test.ts` unconditionally.
- **D-02:** No coverage absorption needed — both files contain pure environment sanity checks (`typeof process`, `typeof document`) with zero logger logic. Removing them does not reduce meaningful test coverage.
- **D-03:** After deletion, run `pnpm run test` to confirm all remaining tests pass.

[auto] Selected: delete directly, no absorption needed.

### Custom Helper Audit

- **D-04:** `tests/common/capture.helper.ts` (`captureAll`) — **KEEP**. No rstest 0.9.x builtin intercepted `process.stdout.write` / `process.stderr.write` at the stream level. It is the only way to capture output from the logger's synchronous dispatch. Reason: documented in file header.
- **D-05:** `tests/common/reset.helper.ts` — **KEEP**. Resets the logger's singleton registry by mutating `globalThis.$logger-registry` in-place. No rstest builtin covers logger-specific registry teardown. The `beforeEach` hook is already using the rstest builtin; only the reset logic is custom.
- **D-06:** No custom helpers are replaced or removed in this phase. TEST-03 (systematic helper audit) is deferred to the next milestone.

[auto] Selected: keep both helpers with documented rationale.

### Version Bump

- **D-07:** Set `package.json` `"version"` to exactly `"3.0.0-rc.0"` as the final step of this phase, after smoke tests are removed and tests pass.

[auto] Selected: bump as final step.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Requirements (in-scope for this phase)
- `.planning/REQUIREMENTS.md` §v3.0.0 — TEST-01, TEST-02, VERSION-01

### Deferred requirements (do NOT implement in this phase)
The following are explicitly out of scope for Phase 07 and must NOT be planned:
- TEST-03, TEST-04, TEST-05 — extended helper audit and worker mock simplification
- BATTERY-01..07 — shared test battery infrastructure

</canonical_refs>

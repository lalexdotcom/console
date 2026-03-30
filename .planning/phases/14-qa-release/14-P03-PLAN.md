---
phase: 14-qa-release
plan: P03
type: execute
wave: 2
depends_on:
  - P02
files_modified:
  - package.json
autonomous: true
requirements:
  - QA-02
  - VERSION-03

must_haves:
  truths:
    - "npx tsc --noEmit exits with 0 errors"
    - "pnpm test passes all 520 tests with 0 failures"
    - "package.json version field is exactly 3.0.2-rc.0"
  artifacts:
    - path: "package.json"
      provides: "Version bumped to 3.0.2-rc.0 after all quality gates pass"
  key_links:
    - from: "package.json"
      to: "version"
      via: "direct edit"
      pattern: "\"version\": \"3.0.2-rc.0\""
---

<objective>
Run all remaining quality gates in order, then bump the package version to signal a
fully-verified release candidate state.

Gate order (per phase CONTEXT.md Agent's Discretion):
1. Confirm `npx tsc --noEmit` exits 0 (QA-02 — already passing per D-05)
2. Run full test suite — `pnpm test` must pass 520 tests, 0 failures  
3. Bump `package.json` version to `3.0.2-rc.0` (VERSION-03) — LAST, only after gates pass

Depends on P02 having resolved Biome issues (QA-03 must already be clean).

Output: package.json with version "3.0.2-rc.0"
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/14-qa-release/14-CONTEXT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify TSC gate (QA-02)</name>
  <files>tsconfig.json</files>
  <read_first>
    - tsconfig.json — verify include covers both src/ and tests/
  </read_first>
  <action>
Run TypeScript type-check to confirm zero errors:

```bash
npx tsc --noEmit
```

Expected output: no output (silent success) with exit code 0.

Do NOT modify tsconfig.json — D-05 confirms it already covers src/ + tests/.
This task is purely a verification gate. If it fails (non-zero exit), STOP and report
the TypeScript errors — do not proceed to Tasks 2 or 3.
  </action>
  <verify>
    <automated>npx tsc --noEmit && echo "TSC_GATE=PASSED" || echo "TSC_GATE=FAILED"</automated>
  </verify>
  <done>
    - Output contains "TSC_GATE=PASSED"
    - No TypeScript error messages in output</done>
</task>

<task type="auto">
  <name>Task 2: Verify test suite gate (520 tests pass)</name>
  <files></files>
  <read_first>
    - rstest.config.ts — verify the 3 test projects are configured correctly
  </read_first>
  <action>
Run the full test suite to confirm all 520 tests pass:

```bash
pnpm test
```

Expected: all tests pass, 0 failures.
Accept any output that shows 0 failed tests and a total count ≥ 520 passed.

If any test fails, STOP and report the failures — do not proceed to Task 3 (version bump).
The version bump must only happen after a clean test run.
  </action>
  <verify>
    <automated>pnpm test 2>&1 | tail -10</automated>
  </verify>
  <done>
    - Output shows 0 failures
    - Output shows ≥ 520 tests passed
    - Exit code is 0</done>
</task>

<task type="auto">
  <name>Task 3: Bump version to 3.0.2-rc.0 (VERSION-03)</name>
  <files>package.json</files>
  <read_first>
    - package.json — read the FULL current content to confirm current version and find exact line to change
  </read_first>
  <action>
Edit package.json and set the `"version"` field to `"3.0.2-rc.0"`.

The current value is `"3.0.1-rc.0"`. Change only the version field value.

Find the line:
```json
  "version": "3.0.1-rc.0",
```

Replace it with:
```json
  "version": "3.0.2-rc.0",
```

Do NOT change any other field in package.json. Do NOT use `pnpm run version` or any
interactive version tool (D-06). Direct file edit only.

This task MUST only run after Tasks 1 and 2 have passed. If either gate failed,
this task must not execute.
  </action>
  <verify>
    <automated>grep '"version"' package.json | head -1</automated>
    <automated>node -e "const p=require('./package.json'); console.log(p.version === '3.0.2-rc.0' ? 'VERSION_OK' : 'VERSION_WRONG: ' + p.version)"</automated>
  </verify>
  <done>
    - grep returns `"version": "3.0.2-rc.0",`
    - node check prints "VERSION_OK"
    - No other package.json fields were modified</done>
</task>

</tasks>

<verification>
- [ ] `npx tsc --noEmit` exits 0 (QA-02 satisfied)
- [ ] `pnpm test` passes all 520 tests, 0 failures
- [ ] `package.json` `version` is exactly `"3.0.2-rc.0"` (VERSION-03 satisfied)
- [ ] Version bump happened LAST — only after TSC and test gates passed
- [ ] No other files were modified beyond package.json
</verification>

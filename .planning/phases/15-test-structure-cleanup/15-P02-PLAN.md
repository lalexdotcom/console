---
phase: 15-test-structure-cleanup
plan: P02
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/browser/browser.test.ts
  - tests/browser/main/browser.test.ts
  - tests/tty/spinner-tty.test.ts
  - tests/tty/main/spinner-tty.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "tests/browser/browser.test.ts exists"
    - "tests/browser/main/ directory does NOT exist"
    - "tests/tty/spinner-tty.test.ts exists"
    - "tests/tty/main/ directory does NOT exist"
    - "pnpm test passes with 520 tests, 0 failures"
  artifacts:
    - path: "tests/browser/browser.test.ts"
      provides: "browser spinner test at correct depth"
    - path: "tests/tty/spinner-tty.test.ts"
      provides: "TTY spinner test at correct depth"
  key_links: []
---

<objective>
Flatten the `tests/browser/main/` and `tests/tty/main/` single-file sub-directories
by moving the test files one level up, into `tests/browser/` and `tests/tty/` respectively.

These directories contain a single file each and add navigation overhead with no grouping
benefit. After moving, update all relative import paths (depth decreases by 1 level) and
delete the now-empty `main/` directories.

`rstest.config.ts` uses recursive globs (`tests/browser/**` and `tests/tty/**`) — no config
change needed.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/15-test-structure-cleanup/15-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move browser.test.ts from tests/browser/main/ to tests/browser/</name>
  <files>
    tests/browser/browser.test.ts
    tests/browser/main/browser.test.ts
  </files>
  <read_first>
    - tests/browser/main/browser.test.ts — read the FULL content (183 lines) to copy with correct imports
  </read_first>
  <action>
1. Read `tests/browser/main/browser.test.ts` in full.

2. Create `tests/browser/browser.test.ts` with the same content, but with these 3 import paths updated:

Before:
```ts
import { L } from '../../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/browser/const';
import { SPINNER_INTERVAL_JITTER } from '../../../src/logger/mixins/spinner/const';
```
After (depth −1: `../../../` → `../../`):
```ts
import { L } from '../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../src/logger/mixins/spinner/browser/const';
import { SPINNER_INTERVAL_JITTER } from '../../src/logger/mixins/spinner/const';
```

All other lines are identical.

3. Delete the original: `git rm tests/browser/main/browser.test.ts`
4. If `tests/browser/main/` is now empty: `git rm -r tests/browser/main/`
  </action>
  <verify>
    <automated>test -f tests/browser/browser.test.ts && echo "NEW_EXISTS" || echo "NEW_MISSING"</automated>
    <automated>test ! -d tests/browser/main && echo "MAIN_GONE" || echo "MAIN_STILL_PRESENT"</automated>
    <automated>grep "from '../../src'" tests/browser/browser.test.ts | head -3</automated>
    <automated>grep "'../../../src'" tests/browser/browser.test.ts | wc -l</automated>
  </verify>
  <done>
    - NEW_EXISTS printed
    - MAIN_GONE printed
    - grep shows 3 lines referencing `../../src`
    - wc -l returns 0 (no stale `../../../src` imports remain)</done>
</task>

<task type="auto">
  <name>Task 2: Move spinner-tty.test.ts from tests/tty/main/ to tests/tty/</name>
  <files>
    tests/tty/spinner-tty.test.ts
    tests/tty/main/spinner-tty.test.ts
  </files>
  <read_first>
    - tests/tty/main/spinner-tty.test.ts — read the FULL content (102 lines) to copy with correct imports
  </read_first>
  <action>
1. Read `tests/tty/main/spinner-tty.test.ts` in full.

2. Create `tests/tty/spinner-tty.test.ts` with the same content, but with these import paths updated (depth −1):

Before:
```ts
import {
  type TTYSpinnerState,
  ttyRenderer,
} from '../../../src/logger/mixins/spinner/tty/renderer';
import { captureAll } from '../../common/capture.helper';
```
After:
```ts
import {
  type TTYSpinnerState,
  ttyRenderer,
} from '../../src/logger/mixins/spinner/tty/renderer';
import { captureAll } from '../common/capture.helper';
```

All other lines are identical. Verify there are no other relative `../` paths referencing
`src/` or `common/` — if any others exist, apply the same depth-reduction rule.

3. Delete the original: `git rm tests/tty/main/spinner-tty.test.ts`
4. If `tests/tty/main/` is now empty: `git rm -r tests/tty/main/`
  </action>
  <verify>
    <automated>test -f tests/tty/spinner-tty.test.ts && echo "NEW_EXISTS" || echo "NEW_MISSING"</automated>
    <automated>test ! -d tests/tty/main && echo "MAIN_GONE" || echo "MAIN_STILL_PRESENT"</automated>
    <automated>grep "from '../../src/" tests/tty/spinner-tty.test.ts</automated>
    <automated>grep "'../../../" tests/tty/spinner-tty.test.ts | wc -l</automated>
  </verify>
  <done>
    - NEW_EXISTS printed
    - MAIN_GONE printed
    - grep shows renderer import from `../../src/...`
    - wc -l returns 0 (no stale `../../../` imports remain)</done>
</task>

<task type="auto">
  <name>Task 3: Commit and verify tests still pass</name>
  <files></files>
  <read_first></read_first>
  <action>
Run the test suite to confirm no regressions:

```bash
pnpm test 2>&1 | tail -5
```

Expected: 520 tests pass, 0 failures.

Then commit:
```bash
git add tests/browser/browser.test.ts tests/tty/spinner-tty.test.ts
git commit -m "refactor(tests): flatten tests/browser/main/ and tests/tty/main/ [15-P02]

Single-file main/ subdirectories removed. Test files now co-located with
adapter and index files. Import depths reduced by 1 level accordingly.
rstest.config.ts glob patterns unchanged (already recursive)."
```
  </action>
  <verify>
    <automated>pnpm test 2>&1 | tail -3</automated>
  </verify>
  <done>
    - Test output shows "520 passed", "0 failed"
    - Commit created</done>
</task>

</tasks>

<verification>
- [ ] `tests/browser/browser.test.ts` exists (depth-corrected imports)
- [ ] `tests/browser/main/` directory deleted
- [ ] `tests/tty/spinner-tty.test.ts` exists (depth-corrected imports)
- [ ] `tests/tty/main/` directory deleted
- [ ] No `../../../src` or `../../common` imports remain in moved files
- [ ] `pnpm test` passes 520 tests, 0 failures
</verification>

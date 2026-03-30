---
phase: 15-test-structure-cleanup
plan: P01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/console/formats.suite.ts
  - tests/common/suites/formats.suite.ts
  - tests/console/json/index.test.ts
  - tests/console/logfmt/index.test.ts
  - tests/console/pretty/index.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "tests/console/formats.suite.ts exists"
    - "tests/common/suites/formats.suite.ts does NOT exist"
    - "All 3 console index.test.ts files import from '../formats.suite' (not '../../common/suites/formats.suite')"
    - "pnpm test passes with 520 tests, 0 failures"
  artifacts:
    - path: "tests/console/formats.suite.ts"
      provides: "formats suite co-located with console tests"
  key_links: []
---

<objective>
Move `tests/common/suites/formats.suite.ts` to `tests/console/formats.suite.ts` and
update the 3 console format test files to import from the new location.

Rationale: the formats suite tests JSON/logfmt/pretty output discrimination — it is
only meaningful for Node console runtime. TTY and browser runtimes never use it.
Keeping it in `tests/common/suites/` falsely implies it is cross-runtime.

Output: formats.suite.ts at `tests/console/`, with 3 updated importers, original deleted.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/15-test-structure-cleanup/15-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move formats.suite.ts to tests/console/</name>
  <files>
    tests/console/formats.suite.ts
    tests/common/suites/formats.suite.ts
  </files>
  <read_first>
    - tests/common/suites/formats.suite.ts — read the FULL content to copy verbatim
  </read_first>
  <action>
1. Read the full content of `tests/common/suites/formats.suite.ts`.
2. Create `tests/console/formats.suite.ts` with the exact same content.
3. Delete `tests/common/suites/formats.suite.ts` (use: `git rm tests/common/suites/formats.suite.ts`).
  </action>
  <verify>
    <automated>test -f tests/console/formats.suite.ts && echo "NEW_EXISTS" || echo "NEW_MISSING"</automated>
    <automated>test ! -f tests/common/suites/formats.suite.ts && echo "OLD_GONE" || echo "OLD_STILL_PRESENT"</automated>
  </verify>
  <done>
    - NEW_EXISTS printed
    - OLD_GONE printed</done>
</task>

<task type="auto">
  <name>Task 2: Update import path in tests/console/json/index.test.ts</name>
  <files>tests/console/json/index.test.ts</files>
  <read_first>
    - tests/console/json/index.test.ts — read full file to locate the formats.suite import line
  </read_first>
  <action>
Find and replace the formats.suite import line:

Before:
```ts
import { formatsSuite } from '../../common/suites/formats.suite';
```
After:
```ts
import { formatsSuite } from '../formats.suite';
```

Do NOT modify any other line.
  </action>
  <verify>
    <automated>grep "formats.suite" tests/console/json/index.test.ts</automated>
  </verify>
  <done>
    - grep output is: `import { formatsSuite } from '../formats.suite';`
    - No occurrence of `../../common/suites/formats.suite` remains</done>
</task>

<task type="auto">
  <name>Task 3: Update import path in tests/console/logfmt/index.test.ts</name>
  <files>tests/console/logfmt/index.test.ts</files>
  <read_first>
    - tests/console/logfmt/index.test.ts — read full file to locate the formats.suite import line
  </read_first>
  <action>
Find and replace the formats.suite import line:

Before:
```ts
import { formatsSuite } from '../../common/suites/formats.suite';
```
After:
```ts
import { formatsSuite } from '../formats.suite';
```

Do NOT modify any other line.
  </action>
  <verify>
    <automated>grep "formats.suite" tests/console/logfmt/index.test.ts</automated>
  </verify>
  <done>
    - grep output is: `import { formatsSuite } from '../formats.suite';`
    - No occurrence of `../../common/suites/formats.suite` remains</done>
</task>

<task type="auto">
  <name>Task 4: Update import path in tests/console/pretty/index.test.ts</name>
  <files>tests/console/pretty/index.test.ts</files>
  <read_first>
    - tests/console/pretty/index.test.ts — read full file to locate the formats.suite import line
  </read_first>
  <action>
Find and replace the formats.suite import line:

Before:
```ts
import { formatsSuite } from '../../common/suites/formats.suite';
```
After:
```ts
import { formatsSuite } from '../formats.suite';
```

Do NOT modify any other line.
  </action>
  <verify>
    <automated>grep "formats.suite" tests/console/pretty/index.test.ts</automated>
  </verify>
  <done>
    - grep output is: `import { formatsSuite } from '../formats.suite';`
    - No occurrence of `../../common/suites/formats.suite` remains</done>
</task>

<task type="auto">
  <name>Task 5: Commit and verify tests still pass</name>
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
git add tests/console/formats.suite.ts tests/common/suites/formats.suite.ts \
  tests/console/json/index.test.ts tests/console/logfmt/index.test.ts \
  tests/console/pretty/index.test.ts
git commit -m "refactor(tests): move formats.suite.ts to tests/console/ [15-P01]

formats suite is console-only (JSON/logfmt/pretty discrimination).
Moved from tests/common/suites/ to tests/console/. Updated 3 importers."
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
- [ ] `tests/console/formats.suite.ts` exists with identical content to original
- [ ] `tests/common/suites/formats.suite.ts` deleted
- [ ] All 3 console index.test.ts files import from `'../formats.suite'`
- [ ] `pnpm test` passes 520 tests, 0 failures
</verification>

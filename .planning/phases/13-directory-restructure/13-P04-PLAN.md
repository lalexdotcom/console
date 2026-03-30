---
phase: 13-directory-restructure
plan: P04
type: execute
wave: 3
depends_on: [P02, P03]
files_modified:
  - rstest.config.ts
autonomous: true
requirements:
  - STRUCT-04
  - STRUCT-05

must_haves:
  truths:
    - "7 standalone node test files (D-01) no longer exist on disk"
    - "3 parity files (D-02) no longer exist on disk"
    - "5 old battery files (D-05) no longer exist on disk"
    - "rstest.config.ts node-console include contains 'tests/console/**/*.test.ts' as first entry"
    - "pnpm test exits 0 with all 3 projects green"
    - "Non-shared tests (console.test.ts, registry.test.ts, worker-e2e.test.ts, worker-protocol.test.ts, spinner-tty.test.ts, browser.test.ts) still exist unchanged"
  artifacts:
    - path: "rstest.config.ts"
      provides: "Updated node-console include glob covering tests/console/**"
      contains: "tests/console/**/*.test.ts"
  key_links:
    - from: "rstest.config.ts"
      to: "tests/console/**"
      via: "node-console project include array first entry"
      pattern: "tests/console/\\*\\*/\\*.test\\.ts"
---

<objective>
Remove all obsolete test files and update rstest.config.ts so pnpm test discovers the new
directory layout and all tests pass.

Files removed:
  - D-01: 7 standalone node tests superseded by shared suite batteries
  - D-02: 3 parity files superseded by runSuite's built-in parity mechanism
  - D-05: 5 old battery files replaced by the new per-format index.test.ts files

Config change: add 'tests/console/**/*.test.ts' to node-console project include (D-06).

Purpose: Completes STRUCT-04 (non-shared preserved) and STRUCT-05 (rstest globs updated).
The browser and node-tty project globs already cover the new files — only node-console needs
updating.
Output: 15 files deleted, rstest.config.ts updated, pnpm test green.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/13-directory-restructure/13-CONTEXT.md
@rstest.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete D-01 standalone node test files (7 files)</name>
  <files>
    tests/node/main/formats.test.ts,
    tests/node/main/levels.test.ts,
    tests/node/main/mixins.test.ts,
    tests/node/main/options.test.ts,
    tests/node/main/prefix.test.ts,
    tests/node/main/scopes.test.ts,
    tests/node/main/spinner-node.test.ts
  </files>
  <read_first>
    - .planning/phases/13-directory-restructure/13-CONTEXT.md — confirm D-01 decision: these 7 files are superseded by shared suites running through the new console battery (tests/console/{json,logfmt,pretty}/index.test.ts); explicit confirmation that STRUCT-04 does NOT list them as preserved
  </read_first>
  <action>
Delete the following 7 files using rm (they are superseded by the shared suite batteries
created in P02/P03 and are NOT in the D-05 preserve list per CONTEXT.md §D-01):

  rm tests/node/main/formats.test.ts
  rm tests/node/main/levels.test.ts
  rm tests/node/main/mixins.test.ts
  rm tests/node/main/options.test.ts
  rm tests/node/main/prefix.test.ts
  rm tests/node/main/scopes.test.ts
  rm tests/node/main/spinner-node.test.ts

Do NOT delete any other file in tests/node/main/. The following files in that directory
must remain untouched:
  - console.test.ts        (D-05 keep — tests console patch/unpatch/bypass)
  - registry.test.ts       (D-05 keep — tests singleton registry)
  - worker-e2e.test.ts     (D-05 keep — tests terminateWorker/fallback e2e)
  - worker-protocol.test.ts (D-05 keep — tests IPC protocol with mocked child_process)
  </action>
  <verify>
    <automated>ls tests/node/main/formats.test.ts tests/node/main/levels.test.ts tests/node/main/spinner-node.test.ts 2>&1 | grep -c 'No such file'</automated>
  </verify>
  <done>
    - The grep -c command above returns 3 (all 3 checked files absent)
    - ls tests/node/main/console.test.ts tests/node/main/registry.test.ts tests/node/main/worker-e2e.test.ts tests/node/main/worker-protocol.test.ts → all 4 still present
  </done>
</task>

<task type="auto">
  <name>Task 2: Delete parity files (D-02) and old battery files (D-05)</name>
  <files>
    tests/common/parity.suite.ts,
    tests/node/main/parity-console.test.ts,
    tests/tty/main/parity-tty.test.ts,
    tests/node/main/battery-node-console.test.ts,
    tests/node/main/battery-node-console-worker.test.ts,
    tests/tty/main/battery-node-tty.test.ts,
    tests/tty/main/battery-node-tty-worker.test.ts,
    tests/browser/main/battery-browser.test.ts
  </files>
  <read_first>
    - .planning/phases/13-directory-restructure/13-CONTEXT.md — D-02 (parity covered by runSuite) and D-05 (batteries replaced by new index.test.ts; D-05 preserve list: browser.test.ts, spinner-tty.test.ts)
  </read_first>
  <action>
Delete parity files (D-02 — parity now integrated into runSuite; no dedicated file needed):

  rm tests/common/parity.suite.ts
  rm tests/node/main/parity-console.test.ts
  rm tests/tty/main/parity-tty.test.ts

Delete old battery files (D-05 replacements — superseded by new per-format index.test.ts):

  rm tests/node/main/battery-node-console.test.ts
  rm tests/node/main/battery-node-console-worker.test.ts
  rm tests/tty/main/battery-node-tty.test.ts
  rm tests/tty/main/battery-node-tty-worker.test.ts
  rm tests/browser/main/battery-browser.test.ts

After deletions, verify these D-05 PRESERVED files are still present (do NOT delete):
  tests/tty/main/spinner-tty.test.ts   ← unique TTY spinner tests, not covered by suites
  tests/browser/main/browser.test.ts   ← browser-specific CSS format + spinner badge tests
  tests/tty/env.ts                     ← TTY env stub, required by rstest.config.ts alias
  </action>
  <verify>
    <automated>ls tests/common/parity.suite.ts tests/node/main/battery-node-console.test.ts tests/browser/main/battery-browser.test.ts 2>&1 | grep -c 'No such file'</automated>
  </verify>
  <done>
    - The grep -c command above returns 3 (all 3 checked files absent)
    - ls tests/tty/main/spinner-tty.test.ts tests/browser/main/browser.test.ts tests/tty/env.ts → all 3 still present
    - ls tests/tty/main/parity-tty.test.ts 2>&1 → "No such file or directory"
  </done>
</task>

<task type="auto">
  <name>Task 3: Update rstest.config.ts node-console include and run pnpm test</name>
  <files>rstest.config.ts</files>
  <read_first>
    - rstest.config.ts — read the full file; identify the node-console project object by name: 'node-console' and its current include array: ['tests/node/**/*.test.ts', 'tests/common/**/*.test.ts']
  </read_first>
  <action>
In rstest.config.ts, find the node-console project object (the one with name: 'node-console')
and change its include array from:

  include: ['tests/node/**/*.test.ts', 'tests/common/**/*.test.ts'],

to:

  include: ['tests/console/**/*.test.ts', 'tests/node/**/*.test.ts', 'tests/common/**/*.test.ts'],

The browser project include (['tests/browser/**/*.test.ts']) is NOT modified — it already
covers tests/browser/index.test.ts via the ** glob.

The node-tty project include (['tests/tty/**/*.test.ts', 'tests/common/**/*.test.ts']) is
NOT modified — it already covers tests/tty/index.test.ts via the ** glob.

After updating the file, run:
  pnpm test

Expected outcome:
  - node-console project picks up tests/console/{json,logfmt,pretty}/index.test.ts (new)
    plus tests/node/main/{console,registry,worker-e2e,worker-protocol}.test.ts (preserved)
  - node-tty project picks up tests/tty/index.test.ts (new) plus spinner-tty.test.ts (preserved)
  - browser project picks up tests/browser/index.test.ts (new) plus browser.test.ts (preserved)
  - All 3 projects exit green
  </action>
  <verify>
    <automated>grep "tests/console/\*\*/\*.test\.ts" rstest.config.ts</automated>
  </verify>
  <done>
    - grep returns a match for 'tests/console/**/*.test.ts' inside rstest.config.ts
    - The browser and node-tty include arrays are unchanged (grep confirms their original globs still present)
    - pnpm test exits with code 0
    - No test counts decrease compared to before the restructure (coverage is behaviorally equivalent)
  </done>
</task>

</tasks>

<verification>
- ls tests/node/main/formats.test.ts 2>&1 → "No such file or directory"
- ls tests/node/main/levels.test.ts 2>&1 → "No such file or directory"
- ls tests/common/parity.suite.ts 2>&1 → "No such file or directory"
- ls tests/node/main/battery-node-console.test.ts 2>&1 → "No such file or directory"
- ls tests/tty/main/battery-node-tty.test.ts 2>&1 → "No such file or directory"
- ls tests/browser/main/battery-browser.test.ts 2>&1 → "No such file or directory"
- grep "tests/console/\*\*/\*.test\.ts" rstest.config.ts → returns match
- ls tests/node/main/console.test.ts tests/node/main/registry.test.ts → both present
- ls tests/node/main/worker-e2e.test.ts tests/node/main/worker-protocol.test.ts → both present
- ls tests/tty/main/spinner-tty.test.ts tests/browser/main/browser.test.ts → both present
- pnpm test → exit code 0
</verification>

<success_criteria>
- All 15 files deleted: 7 (D-01) + 3 (D-02) + 5 (D-05 batteries)
- rstest.config.ts node-console include = ['tests/console/**/*.test.ts', 'tests/node/**/*.test.ts', 'tests/common/**/*.test.ts']
- 6 non-shared tests preserved: console.test.ts, registry.test.ts, worker-e2e.test.ts, worker-protocol.test.ts, spinner-tty.test.ts, browser.test.ts
- pnpm test passes with all 3 projects green — no behavioural regression
</success_criteria>

<output>
After completion, create .planning/phases/13-directory-restructure/13-P04-SUMMARY.md
</output>

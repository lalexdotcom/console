# Phase 15: test-structure-cleanup — Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Source:** User directive (gsd-do)

<domain>
## Phase Boundary

Two independent structural improvements to the test directory layout:

1. **formats.suite.ts → console-only:** The `formats` suite tests JSON/logfmt/pretty output
   format discrimination. It is meaningless for TTY and browser runtimes (TTY never produces
   raw json/logfmt; browser uses %c CSS format strings). It must be co-located with console
   tests instead of being in the shared `tests/common/suites/` directory.

2. **Remove main/ sub-directories in browser and tty:** `tests/browser/main/` and
   `tests/tty/main/` are single-file directories that add navigation overhead without
   grouping benefit. Their test files should live directly in `tests/browser/` and `tests/tty/`
   alongside `index.test.ts` and the adapter files.

</domain>

<decisions>
## Implementation Decisions

### formats.suite.ts destination
- Move `tests/common/suites/formats.suite.ts` → `tests/console/formats.suite.ts`
- This places it at the root of the console test directory, shared by all 3 format sub-dirs
- Do NOT create a new subdirectory (e.g. tests/console/suites/) — flat placement is sufficient

### Import updates for formats.suite.ts move
- `tests/console/json/index.test.ts`: `'../../common/suites/formats.suite'` → `'../formats.suite'`
- `tests/console/logfmt/index.test.ts`: same
- `tests/console/pretty/index.test.ts`: same
- No other file imports formats.suite.ts

### main/ flattening — browser
- Move `tests/browser/main/browser.test.ts` → `tests/browser/browser.test.ts`
- Update relative imports (depth −1):
  - `'../../../src'` → `'../../src'`
  - `'../../../src/logger/mixins/spinner/browser/const'` → `'../../src/logger/mixins/spinner/browser/const'`
  - `'../../../src/logger/mixins/spinner/const'` → `'../../src/logger/mixins/spinner/const'`
- Delete `tests/browser/main/` directory after move
- `rstest.config.ts` uses `tests/browser/**/*.test.ts` (glob) — no change needed

### main/ flattening — tty
- Move `tests/tty/main/spinner-tty.test.ts` → `tests/tty/spinner-tty.test.ts`
- Update relative imports (depth −1):
  - `'../../common/capture.helper'` → `'../common/capture.helper'`
  - `'../../../src/...'` paths are not present in spinner-tty.test.ts (uses only rstest + src via relative paths)
  - Re-check: imports are `'../../../src/logger/...'` style? → no, spinner-tty.test.ts uses ttyRenderer via `'../../../src/logger/mixins/spinner/tty/renderer'` — depth shift needed: `'../../../src/logger/...'` → `'../../src/logger/...'`
- Delete `tests/tty/main/` directory after move
- `rstest.config.ts` uses `tests/tty/**/*.test.ts` (glob) — no change needed

### the agent's Discretion
- Import of `{afterEach, describe, expect, rs, test}` from `@rstest/core` in browser.test.ts: path-independent, no change needed
- Order of operations: move file first, update imports, then delete empty main/ dir

</decisions>

<canonical_refs>
## Canonical References

- `tests/browser/main/browser.test.ts` — source file (183 lines), all imports to update
- `tests/tty/main/spinner-tty.test.ts` — source file (102 lines), all imports to update
- `tests/common/suites/formats.suite.ts` — file to move
- `tests/console/json/index.test.ts` — importer, update formats.suite import
- `tests/console/logfmt/index.test.ts` — importer, update formats.suite import
- `tests/console/pretty/index.test.ts` — importer, update formats.suite import
- `rstest.config.ts` — glob patterns already cover new paths (no edit needed)

</canonical_refs>

<specifics>
## Exact import changes

### browser.test.ts (after move to tests/browser/browser.test.ts)
Before:
```ts
import { L } from '../../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/browser/const';
import { SPINNER_INTERVAL_JITTER } from '../../../src/logger/mixins/spinner/const';
```
After:
```ts
import { L } from '../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../src/logger/mixins/spinner/browser/const';
import { SPINNER_INTERVAL_JITTER } from '../../src/logger/mixins/spinner/const';
```

### spinner-tty.test.ts (after move to tests/tty/spinner-tty.test.ts)
Before:
```ts
import { captureAll } from '../../common/capture.helper';
```
After:
```ts
import { captureAll } from '../common/capture.helper';
```
Also check for any `../../../src/...` patterns in spinner-tty.test.ts and reduce depth by 1.

</specifics>

<deferred>
## Deferred Ideas

None — phase scope is fully defined above.

</deferred>

---

*Phase: 15-test-structure-cleanup*
*Context gathered: 2026-03-30*

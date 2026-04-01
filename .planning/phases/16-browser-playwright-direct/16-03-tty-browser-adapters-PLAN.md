---
phase: 16-browser-playwright-direct
plan: "03"
type: execute
wave: 2
depends_on:
  - "16-01"
files_modified:
  - tests/tty/adapter.ts
  - tests/browser/adapter.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "TTY adapter parse() strips ANSI and applies the same badge/icon logic as pretty adapter"
    - "Browser adapter parse() strips %c markers then matches spinner icon or level badge"
    - "Both adapters capture() returns Promise<LogOutput[]>"
    - "Neither adapter has a logger property"
  artifacts:
    - path: "tests/tty/adapter.ts"
      provides: "TTY adapter with parse() (pretty-format parser, ANSI-aware)"
      contains: "stripAnsi"
    - path: "tests/browser/adapter.ts"
      provides: "Browser adapter with parse() (CSS %c parser) and updated capture()"
      contains: "replace(/%c/g"
  key_links:
    - from: "tests/tty/adapter.ts"
      to: "tests/common/capture.helper.ts"
      via: "captureAsync called inside capture() — TTY uses same Node stream capture"
      pattern: "captureAsync"
    - from: "tests/browser/adapter.ts"
      to: "tests/common/output.ts"
      via: "parse() returns LogOutput | null"
      pattern: "import.*LogOutput"
---

<objective>
Implement parse() on the TTY adapter and the browser adapter and update both capture()
methods to produce LogOutput[].

Purpose: TTY and browser adapters are the remaining two concrete adapters. After this plan
all 5 adapters satisfy the new TestAdapter contract. Plans 04–06 (suite migration) can
then run — they depend on waves 1+2 being complete.
Output: Two adapter files with parse() + updated capture(), no logger getter.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/16-browser-playwright-direct/16-CONTEXT.md
@.planning/phases/16-browser-playwright-direct/16-RESEARCH.md
@.planning/phases/16-browser-playwright-direct/16-01-foundation-SUMMARY.md

<interfaces>
<!-- New contracts from plan 01 -->

From tests/common/output.ts:
```ts
export interface LogOutput {
  raw: string;
  level?: string;
  scope?: string;
  msg?: string;
  date?: string;
  caller?: string;
  badgeColor?: string;
  icon?: string;
  progress?: number;
  spinnerState?: 'running' | 'success' | 'fail' | 'stop';
}
```

From tests/tty/adapter.ts (CURRENT):
```ts
export const mainAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() { /* sets TTY env + format */ },
  capture: captureAsync,        // ← becomes method wrapping captureAsync + parse()
  get logger(): RootLogger { return L; },  // ← REMOVE
};
```

From tests/browser/adapter.ts (CURRENT):
```ts
export const browserAdapter: TestAdapter = {
  name: 'browser-main',
  setup() { /* L.format is irrelevant in browser */ },
  async capture(fn): Promise<string[]> {
    // spies on console.log/warn/error/debug/groupCollapsed
    // returns [String(c[0])] per spy call, filtered of stack traces
  },
  get logger(): RootLogger { return L; },  // ← REMOVE
};
```

<!-- TTY output format: same as pretty (badge in brackets) but with ANSI color active.
     parsePrettyLine logic (stripAnsi + badge/icon regex) applies identically. -->

<!-- Browser output format:
     c[0] = format string like "%c[INFO]%c hello" or "%c-%c" (spinner running)
     Strip %c markers → "[INFO] hello" or "-"
     Then apply same badge/icon matching as pretty.
     Browser running spinner icon is '-' (BROWSER_DEFAULT_RUNNING_ICON.icon).
     Browser success = '✔', fail = '✖'.
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add parse() to TTY adapter</name>
  <files>tests/tty/adapter.ts</files>
  <read_first>
    - tests/tty/adapter.ts — full current file (understand setup, env vars, captureAsync usage)
    - tests/console/pretty/adapter.ts — reference: parsePrettyLine pattern to replicate inline
    - .planning/phases/16-browser-playwright-direct/16-RESEARCH.md — TTY parse() strategy section
  </read_first>
  <action>
    EDIT tests/tty/adapter.ts:

    1. Remove `import type { RootLogger }` and any associated `_typeCheck` line
    2. Add `import type { LogOutput } from '../common/output'`
    3. Add the following module-level helpers before the adapter objects.
       These are intentionally inlined (not shared) since the TTY adapter is independent of
       the pretty adapter at runtime:

       ```ts
       function stripAnsi(s: string): string {
         return s.replace(/\x1b\[[0-9;]*m/g, '');
       }

       const BADGE_TO_LEVEL: Record<string, string> = {
         EMERGENCY: 'emerg',
         ALERT: 'alert',
         CRITICAL: 'crit',
         ERROR: 'error',
         WARNING: 'warn',
         NOTICE: 'notice',
         SUCCESS: 'success',
         INFO: 'info',
         VERBOSE: 'verb',
         DEBUG: 'debug',
         'WHO CARES?': 'wth',
       };

       function parsePrettyLine(line: string): LogOutput | null {
         const stripped = stripAnsi(line);
         if (stripped.trim().length === 0) return null;
         if (/^\s+at /.test(stripped)) return null;

         const iconMatch = stripped.match(/^\[\s*([^\[\]\s]{1,3})\s*\]\s*(.*)/);
         if (iconMatch) {
           const icon = iconMatch[1];
           const spinnerState: LogOutput['spinnerState'] =
             icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
           return { raw: line, icon, spinnerState, msg: iconMatch[2].trim() };
         }

         const badgeMatch = stripped.match(
           /^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/,
         );
         if (badgeMatch) {
           return {
             raw: line,
             level: BADGE_TO_LEVEL[badgeMatch[1].trim()],
             scope: badgeMatch[2],
             msg: badgeMatch[3].trim(),
           };
         }

         return { raw: line };
       }
       ```

    4. Replace `capture: captureAsync` with a method:
       ```ts
       async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
         const rawLines = await captureAsync(fn);
         return rawLines
           .map((line) => parsePrettyLine(line))
           .filter((e): e is LogOutput => e !== null);
       },
       parse: parsePrettyLine,
       ```

    5. Remove `get logger(): RootLogger { return L; }` from the adapter
    6. If a workerAdapter is defined in this file, apply the same changes to it
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "tty/adapter" | head -20</verify>
  <acceptance_criteria>
    - TTY adapter has parse() = parsePrettyLine (handles ANSI, badges, icons)
    - TTY adapter has capture() wrapping captureAsync + map(parse) + filter
    - No logger property on TTY adapter
    - stripAnsi strips escape sequences before badge matching
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add parse() to browser adapter with %c stripping</name>
  <files>tests/browser/adapter.ts</files>
  <read_first>
    - tests/browser/adapter.ts — full current file (understand spy collection, filter logic)
    - .planning/phases/16-browser-playwright-direct/16-RESEARCH.md — browser parse() strategy section
    - src/logger/mixins/spinner/browser/const.ts — BROWSER_DEFAULT_RUNNING_ICON.icon value
  </read_first>
  <action>
    EDIT tests/browser/adapter.ts:

    1. Remove `import type { RootLogger }` 
    2. Add `import type { LogOutput } from '../common/output'`
    3. Add the following module-level helpers before the adapter object:

       ```ts
       const BADGE_TO_LEVEL: Record<string, string> = {
         EMERGENCY: 'emerg',
         ALERT: 'alert',
         CRITICAL: 'crit',
         ERROR: 'error',
         WARNING: 'warn',
         NOTICE: 'notice',
         SUCCESS: 'success',
         INFO: 'info',
         VERBOSE: 'verb',
         DEBUG: 'debug',
         'WHO CARES?': 'wth',
       };

       /**
        * Parses one browser %c format-string line into a LogOutput.
        * c[0] is the format string: "%c[INFO]%c hello" or "%c-%c" (running spinner).
        * Returns null for empty lines.
        */
       function parseBrowserLine(line: string): LogOutput | null {
         if (!line || line.trim().length === 0) return null;

         // Strip %c markers to get readable text
         const text = line.replace(/%c/g, '').trim();
         if (text.length === 0) return null;

         // Spinner icon: '-' (running), '✔' (success), '✖' (fail)
         // Browser uses short single-char icons not wrapped in brackets
         const spinnerMatch = text.match(/^([✔✖\-])\s*(.*)/);
         if (spinnerMatch && spinnerMatch[1].length <= 2) {
           const icon = spinnerMatch[1];
           const spinnerState: LogOutput['spinnerState'] =
             icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
           return { raw: line, icon, spinnerState, msg: spinnerMatch[2].trim() };
         }

         // Level badge: [BADGE] or [BADGE <scope>]
         const badgeMatch = text.match(/^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/);
         if (badgeMatch) {
           return {
             raw: line,
             level: BADGE_TO_LEVEL[badgeMatch[1].trim()],
             scope: badgeMatch[2],
             msg: badgeMatch[3].trim(),
           };
         }

         return { raw: line };
       }
       ```

    4. Update the existing capture() method signature from `Promise<string[]>` to
       `Promise<LogOutput[]>` and apply parse() after spy collection:

       The existing spy collection logic (logSpy, warnSpy, errorSpy, debugSpy, groupSpy)
       remains UNCHANGED. Only the final return statement changes:

       OLD final return (before the finally block):
       ```ts
       return [
         ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
       ].filter((l) => l.length > 0 && !/^\s+at /.test(l));
       ```

       NEW return (same spy collection, apply parse + filter):
       ```ts
       const rawLines = [
         ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
         ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
       ].filter((l) => l.length > 0);
       return rawLines
         .map((line) => parseBrowserLine(line))
         .filter((e): e is LogOutput => e !== null);
       ```

       Note: the `!/^\s+at /.test(l)` guard is now handled by parseBrowserLine returning
       null for such lines (though browser output typically doesn't have stack traces on c[0]).

    5. Add `parse: parseBrowserLine` to the adapter object
    6. Remove `get logger(): RootLogger { return L; }`
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "browser/adapter" | head -20</verify>
  <acceptance_criteria>
    - browser adapter parse() strips %c markers then matches spinner icon or badge
    - browser adapter capture() returns Promise&lt;LogOutput[]&gt;
    - Spy collection logic (all 5 console methods) is unchanged
    - No logger property on the adapter
    - parse: parseBrowserLine assigned directly on the adapter object
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# All 5 adapters now have parse() — confirm
grep -rn "parse(" tests/tty/adapter.ts tests/browser/adapter.ts

# No logger getter remaining in either file
grep -rn "get logger" tests/tty/adapter.ts tests/browser/adapter.ts \
  && echo "FAIL" || echo "OK: no logger getter"

# TypeScript check for these files
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "tty/adapter|browser/adapter" | head -20
```

## Success Criteria

- TTY adapter parse() applies stripAnsi then badge/icon regex — same logic as pretty adapter
- Browser adapter parse() removes `%c` markers then matches spinner icon or badge
- Both adapters `capture()` returns `Promise<LogOutput[]>`
- No `logger` property on either adapter

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-03-tty-browser-adapters-SUMMARY.md`
</output>

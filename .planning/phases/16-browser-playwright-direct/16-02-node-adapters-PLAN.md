---
phase: 16-browser-playwright-direct
plan: "02"
type: execute
wave: 2
depends_on:
  - "16-01"
files_modified:
  - tests/console/json/adapter.ts
  - tests/console/logfmt/adapter.ts
  - tests/console/pretty/adapter.ts
autonomous: true
requirements:
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "json adapter parse() returns LogOutput with level=severity (not the channel level field), msg, scope, date, caller, progress"
    - "logfmt adapter parse() reuses the existing parseLogfmt() helper and maps its fields to LogOutput"
    - "pretty adapter parse() strips ANSI, detects spinner icon or log badge, and maps to LogOutput"
    - "All three adapters capture() wraps captureAsync + maps each line through parse() + filters nulls"
    - "All three adapters have no logger getter"
  artifacts:
    - path: "tests/console/json/adapter.ts"
      provides: "json adapter with parse() and updated capture()"
      contains: "JSON.parse"
    - path: "tests/console/logfmt/adapter.ts"
      provides: "logfmt adapter with parse() using parseLogfmt helper"
      contains: "parseLogfmt"
    - path: "tests/console/pretty/adapter.ts"
      provides: "pretty adapter with parse() using stripAnsi + BADGE_TO_LEVEL"
      contains: "BADGE_TO_LEVEL"
  key_links:
    - from: "tests/console/json/adapter.ts"
      to: "tests/common/capture.helper.ts"
      via: "captureAsync called inside capture() method"
      pattern: "captureAsync"
    - from: "tests/console/pretty/adapter.ts"
      to: "tests/common/output.ts"
      via: "LogOutput imported and returned by parse()"
      pattern: "import.*LogOutput"
---

<objective>
Implement parse() on the three Node console adapters (json, logfmt, pretty) and update
their capture() to produce LogOutput[] instead of string[].

Purpose: These are the adapters used by all node-console index.test.ts files. After this
plan, node console tests can run against the new capture type once suites are migrated.
Output: Three adapter files with parse() + updated capture(), logger getter removed.
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
<!-- New contracts from plan 01 that these adapters must satisfy -->

From tests/common/output.ts (created in plan 01):
```ts
export interface LogOutput {
  raw: string;
  level?: string;      // the severity level name ('info', 'error', etc.)
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

From tests/common/adapter.ts (updated in plan 01):
```ts
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  parse(line: string): LogOutput | null;
  capture(fn: () => void | Promise<void>): Promise<LogOutput[]>;
  // logger property REMOVED
}
```

From tests/console/json/adapter.ts (CURRENT — will be modified):
```ts
export const mainAdapter: TestAdapter = {
  name: 'node-console:json',
  setup() { L.format = 'json'; },
  capture: captureAsync,        // ← becomes a method wrapping captureAsync + parse()
  get logger(): RootLogger { return L; },  // ← REMOVED
};
```

From tests/common/capture.helper.ts (UNCHANGED — still used internally):
- captureAsync(fn): Promise<string[]>  — raw line capture, still used inside capture()

From tests/common/logfmt.helper.ts (UNCHANGED — reused by logfmt parse()):
- parseLogfmt(line: string): Record<string, string>
  Returns key-value pairs. Fields of interest: severity, scope, msg, time, caller.
</interfaces>

<!-- JSON output format reference:
  {"time":"2026-01-01T00:00:00.000Z","level":"info","severity":"info","msg":"hello","data":{}}
  IMPORTANT: use p.severity (not p.level) for LogOutput.level — p.level is the console channel name.
-->
<!-- logfmt output format reference:
  time="2026-01-01" level=info severity=info msg="hello world" scope=myScope
-->
<!-- pretty output badge format reference (L.color=false):
  [INFO] hello world
  [INFO <scope>] hello world
  [ ⋯ ] spinner running
  [ ✔ ] spinner success
  [ ✖ ] spinner fail
  Stack trace lines start with "    at " — return null for these.
-->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add parse() to json and logfmt adapters</name>
  <files>tests/console/json/adapter.ts, tests/console/logfmt/adapter.ts</files>
  <read_first>
    - tests/console/json/adapter.ts — full current file (understand capture: captureAsync pattern)
    - tests/console/logfmt/adapter.ts — full current file
    - tests/common/logfmt.helper.ts — to understand parseLogfmt() return shape
    - tests/common/capture.helper.ts — to understand captureAsync signature
  </read_first>
  <action>
    EDIT tests/console/json/adapter.ts:

    1. Remove `import type { RootLogger } from '../../../src/types'`
    2. Remove `const _typeCheck: RootLogger = WL as unknown as RootLogger; void _typeCheck;` (keep or remove — it still compiles without logger in TestAdapter, but it's noise; remove it)
    3. Add `import type { LogOutput } from '../../common/output'`
    4. Replace `capture: captureAsync` with a method:
       ```ts
       async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
         const rawLines = await captureAsync(fn);
         return rawLines
           .map((line) => this.parse(line))
           .filter((e): e is LogOutput => e !== null);
       },
       ```
    5. Add parse() method after capture:
       ```ts
       parse(line: string): LogOutput | null {
         try {
           const p = JSON.parse(line) as Record<string, unknown>;
           if (typeof p.severity !== 'string') return null;
           return {
             raw: line,
             level: p.severity,
             scope: typeof p.scope === 'string' ? p.scope : undefined,
             msg: typeof p.msg === 'string' ? p.msg : undefined,
             date: typeof p.time === 'string' ? p.time : undefined,
             caller: typeof p.caller === 'string' ? p.caller : undefined,
             progress: typeof p.progress === 'number' ? p.progress : undefined,
           };
         } catch {
           return null;
         }
       },
       ```
    6. Remove `get logger(): RootLogger { return L; }` from both mainAdapter and workerAdapter
    7. Apply the same changes to workerAdapter (same parse(), same capture() body using `this.parse`)

    EDIT tests/console/logfmt/adapter.ts:

    1. Remove `import type { RootLogger }` and `_typeCheck`
    2. Add `import type { LogOutput } from '../../common/output'`
    3. Add `import { parseLogfmt } from '../../common/logfmt.helper'` (already imported if present)
    4. Replace `capture: captureAsync` with the same wrapping method as json:
       ```ts
       async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
         const rawLines = await captureAsync(fn);
         return rawLines
           .map((line) => this.parse(line))
           .filter((e): e is LogOutput => e !== null);
       },
       ```
    5. Add parse():
       ```ts
       parse(line: string): LogOutput | null {
         const p = parseLogfmt(line);
         if (!p.severity) return null;
         return {
           raw: line,
           level: p.severity,
           scope: p.scope,
           msg: p.msg,
           date: p.time,
           caller: p.caller,
         };
       },
       ```
    6. Remove `get logger()` from both mainAdapter and workerAdapter
    7. Apply same parse() + capture() to workerAdapter
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "json/adapter\|logfmt/adapter" | head -20</verify>
  <acceptance_criteria>
    - json adapter parse() returns null for non-JSON lines, returns LogOutput with level=p.severity for JSON lines
    - logfmt adapter parse() delegates to parseLogfmt() and guards on p.severity
    - Both adapters capture() method calls captureAsync() then maps through parse() then filters nulls
    - No logger property on any adapter object in either file
    - TypeScript type check passes for these two files (other files may still have errors)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add parse() to pretty adapter with ANSI stripping and badge matching</name>
  <files>tests/console/pretty/adapter.ts</files>
  <read_first>
    - tests/console/pretty/adapter.ts — full current file
    - tests/common/capture.helper.ts — captureAsync signature
    - .planning/phases/16-browser-playwright-direct/16-RESEARCH.md — pretty parse() strategy and BADGE_TO_LEVEL mapping
  </read_first>
  <action>
    EDIT tests/console/pretty/adapter.ts:

    1. Remove `import type { RootLogger }` and `_typeCheck` lines
    2. Add `import type { LogOutput } from '../../common/output'`
    3. Add the following module-level helpers BEFORE the adapter objects:

       ```ts
       /** Strips ANSI colour escape sequences from a string. */
       function stripAnsi(s: string): string {
         return s.replace(/\x1b\[[0-9;]*m/g, '');
       }

       /** Maps pretty-format badge text to the LogOutput level string. */
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
        * Parses one pretty-format output line into a LogOutput.
        * Returns null for stack trace lines and blank lines.
        */
       function parsePrettyLine(line: string): LogOutput | null {
         const stripped = stripAnsi(line);
         if (stripped.trim().length === 0) return null;
         if (/^\s+at /.test(stripped)) return null;

         // Spinner icon bracket: [ ⋯ ] / [ ✔ ] / [ ✖ ] / [ - ]
         // Icon is a short (1–3 char) non-bracket token between [ and ]
         const iconMatch = stripped.match(/^\[\s*([^\[\]\s]{1,3})\s*\]\s*(.*)/);
         if (iconMatch) {
           const icon = iconMatch[1];
           const spinnerState: LogOutput['spinnerState'] =
             icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
           return { raw: line, icon, spinnerState, msg: iconMatch[2].trim() };
         }

         // Level badge: [BADGE] or [BADGE <scope>]
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

    4. Replace `capture: captureAsync` on mainAdapter with:
       ```ts
       async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
         const rawLines = await captureAsync(fn);
         return rawLines
           .map((line) => parsePrettyLine(line))
           .filter((e): e is LogOutput => e !== null);
       },
       parse: parsePrettyLine,
       ```

    5. Remove `get logger()` from mainAdapter and workerAdapter
    6. Apply identical capture() + parse: parsePrettyLine to workerAdapter
  </action>
  <verify>npx tsc --noEmit --project tsconfig.json 2>&1 | grep "pretty/adapter" | head -20</verify>
  <acceptance_criteria>
    - parsePrettyLine() is defined at module level and handles: blank → null, "at ..." → null, "[ ✔ ]..." → spinnerState:success, "[INFO]..." → level:'info'
    - pretty adapter parse() is parsePrettyLine (can be assigned directly)
    - pretty adapter capture() wraps captureAsync + filters nulls
    - No logger property on mainAdapter or workerAdapter
  </acceptance_criteria>
</task>

</tasks>

## Verification

```bash
# Check parse() exists in all three adapters
grep -l "parse(" tests/console/json/adapter.ts tests/console/logfmt/adapter.ts tests/console/pretty/adapter.ts

# Confirm no logger getter remains
grep -rn "get logger" tests/console/json/adapter.ts tests/console/logfmt/adapter.ts tests/console/pretty/adapter.ts \
  && echo "FAIL: logger getter still present" || echo "OK"

# TypeScript check for these files only (other errors expected from unmigrated suites)
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "console/(json|logfmt|pretty)/adapter" | head -20
```

## Success Criteria

- All three adapters implement `parse()` and return `LogOutput | null`
- All three adapters implement `capture()` as a method wrapping `captureAsync` + map + filter
- No `logger` getter on any adapter object
- json `parse()` uses `p.severity` (not `p.level`) for `LogOutput.level`
- logfmt `parse()` delegates to existing `parseLogfmt()` helper
- pretty `parse()` strips ANSI before regex matching

<output>
After completion, create `.planning/phases/16-browser-playwright-direct/16-02-node-adapters-SUMMARY.md`
</output>

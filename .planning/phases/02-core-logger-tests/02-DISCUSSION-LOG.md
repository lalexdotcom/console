# Phase 2: Core Logger Tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24

---

## Area 1: Test File Structure

**Q: How to organize test files in `tests/node/main/`?**

Options presented:
- 1 file per requirement group (`levels.test.ts`, `formats.test.ts`, etc.) ← **selected**
- Thematic grouping (3 files: core, config, extensions)
- Single file

**Selected:** 1 file per requirement group

**Q: Internal organization — `describe()` or flat tests?**

Options presented:
- `describe()` by sub-groups inside each file ← **selected**
- Flat tests with requirement code prefix

**Selected:** `describe()` blocks by sub-groups

---

## Area 2: Console Method Dispatch Strategy (CORE-01)

**Q: Does rstest expose `vi` / `spyOn`?**
Checked: `@rstest/core` exports do not include `vi`, `spyOn`, or any mock API.

**Q: How to verify level → console method dispatch without library APIs?**

Options presented:
- `bypass(spyConsole)` with a custom console object
- Manual replacement of `console.error` etc.
- Capture stdout + stderr separately

User raised concern about using library internals (`bypass`) to test the library.
Discussion: `bypass` redirects destination, not dispatch — not circular. But also:
in Node.js, `console.warn`/`console.error` write to stderr; `console.info`/`console.debug`
write to stdout. This provides independent stream-based verification.

**Selected:** Add `captureAll()` helper that captures both streams simultaneously.
Returns `{ stdout: string[], stderr: string[] }`. No library APIs involved.

**Q: `captureAll` implementation — two separate helpers or one combined?**

Options presented:
- Separate `captureStdout` + `captureStderr`
- Single `captureAll()` returning tagged output ← **selected**

**Selected:** Single `captureAll()` returning `{ stdout, stderr }`

---

## Area 3: Format Assertion Depth (CORE-04, CORE-05, CORE-06)

**Q: ANSI markers in pretty mode?**

User clarification: ANSI codes are TTY-only. Node console mode uses `renderConsolePrefix`
which returns plain text (no ANSI). Confirmed by reading `src/logger/prefix/render.ts`.

**Q: Assertion depth for JSON/logfmt/pretty?**

Options presented:
- Parse + verify essential fields only
- Parse + snapshot

**User specification:** Parse + snapshot + verify additional fields when present
(scope, caller, progress, etc.)

**Selected:** Parse fields (core + conditional) + `toMatchInlineSnapshot()` snapshots
for full regression coverage.

---

## Area 4: Mixin / Rate-Limit Testing (MIX-01, MIX-02, MIX-03)

**Context shared:** `once`/`limit` counters live in a closure (per `createLimitMixin` call),
NOT in the registry. `reset.ts` `beforeEach` does not reset these counters.

Each `L.scope('name')` calls `createLimitMixin` fresh → new `entries` Map.
`reset.ts` deletes all scopes in `beforeEach` → scope counters are always zero at test start.

**Q: Isolation strategy for mixin tests?**

Options presented:
- Natural call-site isolation (different lines = different keys)
- Extend `reset.ts` to also clear counters
- Fresh registry per test
- Fresh scope per test ← **selected**

**Selected:** `L.scope('unique-name')` per test. Scope deletion in `beforeEach` ensures
fresh `entries` Map. Root logger (`L`) not used directly in mixin tests.

---
plan: 09-01
phase: 09-env-adapters
status: complete
completed: 2026-03-26
---

## Summary

Created `tests/tty/env.ts` (static TTY env override — alias target for Phase 10 rspack source.alias) and `tests/tty/main/battery-node-tty.test.ts` (node-tty battery with 6 shared suites in console-mode pretty format).

## Key Files

### Created
- `tests/tty/env.ts` — 3 executable lines: `export * from '../../src/utils/env'` + `export const isNodeTTY = true` + `export const isNodeConsole = false`
- `tests/tty/main/battery-node-tty.test.ts` — inline `nodeTtyAdapter` (name: `node-tty:pretty`, setup sets `L.format = 'pretty'`) + 6 suite instantiations (levels, scopes, options, prefix, mixins, spinners; formats excluded per D-07)

## Decisions Made

- `isNodeTTY` is a rspack bundle-time constant inlined at `false` in the test bundle — no runtime override is attempted. Phase 10 will wire the alias.
- `captureAsync` copied verbatim from `battery-node-console.test.ts` — no ANSI stripping needed in Phase 09 (console mode produces no ANSI sequences in prefix output).
- `formats.suite` excluded: TTY mode never renders raw json/logfmt.

## Verification

- `tsc --noEmit` exits 0
- `pnpm test` exits 0 — all 18 test files pass (1065 tests)
- `grep "export const isNodeTTY = true" tests/tty/env.ts` → match
- `grep "makeFormatsSuite" tests/tty/main/battery-node-tty.test.ts` → no match (intentional)

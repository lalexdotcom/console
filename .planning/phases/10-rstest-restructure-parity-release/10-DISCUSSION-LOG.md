# Phase 10: rstest Restructure, Parity Suite & Release — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 10-rstest-restructure-parity-release
**Areas discussed:** TTY battery adaptation, parity suite depth, ESM dirname, parity file locations

---

## TTY battery adaptation

| Option | Description | Selected |
|--------|-------------|----------|
| Remove broken suites | scopes, prefix, spinners dropped; keep levels, options, mixins | ✓ |
| Strip ANSI in captureAsync | `stripVTControlCharacters` + adapter guards in shared suites | |
| Replace with TTY-native assertions | New inline tests checking ANSI-formatted output directly | |

**User's choice:** Remove broken suites — keep only levels, options, mixins in TTY battery

**Notes:** Suites broken by `isNodeTTY=true` activation: `scopes.suite.ts` and `prefix.suite.ts`
(call `JSON.parse()` on ANSI-prefixed TTY output) and `spinners.suite.ts` (designed for
non-TTY timing, uses `CONSOLE_SPINNER_INTERVAL`). TTY spinner coverage stays in
`spinner-tty.test.ts`. Same reduction applies to both `battery-node-tty.test.ts` and
`battery-node-tty-worker.test.ts`.

---

## Parity suite depth

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | info only (1 test) | |
| Level coverage | info, error, warn, debug (4 tests) | |
| Full | info, error, warn, debug + scoped logger (5 tests) | ✓ |

**User's choice:** Full — info, error, warn, debug + scoped logger (5 tests)

**Notes:** 5 test cases per pair. Normalisation strips ISO timestamps, caller paths, and
ANSI escape codes before byte comparison.

---

## ESM dirname

| Option | Description | Selected |
|--------|-------------|----------|
| `import.meta.dirname` | Native ESM, Node 22 | ✓ |
| `fileURLToPath(new URL('.', import.meta.url))` | Portable to older Node | |

**User's choice:** `import.meta.dirname`

**Notes:** Runtime is Node v22.16.0, confirmed available.

---

## Parity test file locations

**User's choice:** "Is there parity for browser? It should... Do as you want for location,
we'll see together after implementation if it's needed."

**Agent's decision:** Two files by env context:
- `tests/node/main/parity-console.test.ts` — console ↔ console-worker
- `tests/tty/main/parity-tty.test.ts` — tty ↔ tty-worker

Each file is picked up by the matching rstest project's `include` glob. Location can
be reviewed after implementation.

**Browser parity:** No browser-worker adapter exists in this milestone. Noted as
deferred future work.

---

## Agent's Discretion

- Drop `defineConfig()` wrapper in `rstest.config.ts` (use `export default [...]` array form)
- `captureAsync` in TTY batteries needs no ANSI stripping — the 3 remaining suites use
  line-count and date-bracket regex assertions that are compatible with raw ANSI output

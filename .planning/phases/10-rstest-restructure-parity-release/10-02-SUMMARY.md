---
phase: 10-rstest-restructure-parity-release
plan: "02"
subsystem: testing
tags: [parity, battery, worker, tty, console, version]

requires:
  - phase: 10-01
    provides: 3-project rstest config with node-tty using isNodeTTY=true via resolve.alias

provides:
  - tests/common/parity.suite.ts with makeParitySuite() and normalise()
  - tests/node/main/parity-console.test.ts — console ↔ console-worker 5 parity tests
  - tests/tty/main/parity-tty.test.ts — tty ↔ tty-worker 5 parity tests
  - package.json version bumped to 3.0.1-rc.0

affects: []

tech-stack:
  added: []
  patterns:
    - "Parity suite: makeParitySuite(mainAdapter, workerAdapter) with normalise() function"
    - "normalise() strips timestamps, caller paths, ANSI codes, AND stack trace lines"

key-files:
  created:
    - tests/common/parity.suite.ts
    - tests/node/main/parity-console.test.ts
    - tests/tty/main/parity-tty.test.ts
  modified:
    - package.json

key-decisions:
  - "normalise() must also filter stack trace lines (    at path:line:col) — the plan's normalise regex only handled (file:line:col) format, but trace-level calls emit standalone stack lines with different source positions between main and worker captures"
  - "Parity adapters use pretty format (L.format='pretty') — stack trace lines are handled by normalise() filter instead of being prevented with json format"

patterns-established:
  - "Parity normalise pattern: filter stack trace lines first (.filter(l => !/^\\s+at\\s+/.test(l))), then apply regex replacements for timestamps/callers/ANSI"

requirements-completed: [BATTERY-07, VERSION-02]

duration: 20min
completed: 2026-03-27
---

# Phase 10 Plan 02 Summary

**Parity suite infrastructure created — 10 new tests validate console/TTY main↔worker output byte-parity. Version bumped to 3.0.1-rc.0.**

## What Was Built

Created `tests/common/parity.suite.ts` with `makeParitySuite(mainAdapter, workerAdapter)` and a `normalise()` helper. Both `parity-console.test.ts` and `parity-tty.test.ts` use the inline `captureAsync` pattern (same as all battery files) with concrete adapter definitions.

5 parity tests per runner: info, error, warn, debug, scoped logger.

## Deviation from Plan

The plan's `normalise()` regex `replace(/\([^)]+:\d+:\d+\)/g, '(<caller>)')` only handles caller paths in parentheses format. But `error`/`warn` (TRACE_LEVELS) emit stack trace lines in the format `    at /path/file.ts:line:col` (no parentheses). Main and worker captures the same log call from different source lines (49 vs 50), making the stack traces differ. Fixed by adding `.filter(l => !/^\s+at\s+/.test(l))` to strip stack trace lines before comparison.

## Self-Check: PASSED

- `pnpm run test` exits 0 — 977 tests pass (10 new parity tests green)
- Output shows `[node-console]`, `[node-tty]`, `[browser]` project labels
- `package.json` version is `3.0.1-rc.0`
- No regressions in any existing test suite

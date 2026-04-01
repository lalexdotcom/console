---
plan: 16-01-foundation
phase: 16
status: complete
commit: a6f02a1
---

## Summary

Created the parse-layer foundation for the suite-adapter refactor.

## What was built

- **`tests/common/output.ts`** (new): `LogOutput` interface with 10 fields — `raw` (always present) plus 9 optional structured fields (`level`, `scope`, `msg`, `date`, `caller`, `badgeColor`, `icon`, `progress`, `spinnerState`)
- **`tests/common/adapter.ts`** (updated): Added `parse(line: string): LogOutput | null`, changed `capture()` return type to `Promise<LogOutput[]>`, removed `logger` property
- **`tests/common/suites/suite.ts`** (updated): Added `check(entries: LogOutput[]): void` to `TestCase`
- **`tests/common/suites/runner.ts`** (updated): New capture-then-check body — `const entries = await adapter.capture(() => tc.run(adapter)); tc.check(entries)` for both main and parity runs

## State after wave 1

Expected transient compile errors in all unmigrated adapters (5) and suites (7) — Wave 2 and 3 close these.

## Key decisions

- `parse()` returns `null` for non-log lines; `capture()` filters nulls before returning
- `run()` is never called standalone — always wrapped inside the `capture()` arrow function
- `logger` property fully removed from `TestAdapter` — suites use global `L` directly

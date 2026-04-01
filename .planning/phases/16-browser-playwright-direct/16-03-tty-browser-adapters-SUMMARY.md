---
plan: 16-03-tty-browser-adapters
phase: 16
status: complete
commit: d998aef
---

## Summary

Implemented `parse()` on the TTY adapter and browser adapter.

## What was built

- **`tests/tty/adapter.ts`**: Inlined `stripAnsi()`, `BADGE_TO_LEVEL`, and `parsePrettyLine()` (same logic as pretty adapter). Both `ttyAdapter` and `ttyWorkerAdapter` use `parse: parsePrettyLine` and the new `capture()` wrapper.
- **`tests/browser/adapter.ts`**: Added `parseBrowserLine()` which strips `%c` markers then matches spinner icon (`-`, `✔`, `✖`) or level badge. The spy collection logic (5 console methods) is unchanged — only the return statement changed to map through `parse()` + filter nulls.

## State

All 5 concrete adapters (json, logfmt, pretty, tty, browser) implement the new `TestAdapter` contract with `parse()` and `capture(): Promise<LogOutput[]>`. Wave 3 (suite migration) can now proceed.

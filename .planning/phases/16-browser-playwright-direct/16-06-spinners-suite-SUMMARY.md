---
plan: 16-06-spinners-suite
phase: 16
status: complete
commit: a6774d6
---

## Summary

Migrated spinners.suite.ts and resolved all cross-format parse failures that blocked
the entire Phase 16 test suite (520/520 passing after this plan).

## What was built

- **`tests/common/suites/spinners.suite.ts`**: All spinner TestCases migrated; fake timers set up in run(), check() asserts spinnerState, icon, and msg fields
- **`tests/common/helpers/parse-line.ts`** (new): Universal format-agnostic `parseAnyLine()` helper — detects JSON / pretty-bracket / logfmt and delegates to the appropriate sub-parser; used by all adapters
- **All console adapters** (`json/`, `logfmt/`, `pretty/adapter.ts`): Replaced inline format-specific parsers with `parseAnyLine`
- **`tests/tty/adapter.ts`**: Replaced local `parsePrettyLine` with `parseAnyLine`
- **`tests/browser/adapter.ts`**: Added stack trace filter + support for bracket-less badge format (color=true CSS mode)

## Root cause resolved

`suite.setup()` forces a log format (JSON/pretty/logfmt) independently of the adapter's
native format. When cross-format lines flowed through a format-specific parser the
structured fields were not populated → `parseAnyLine()` detects the format on each line.

## Key decisions

- Console spinner format: `[BADGE <scope>] [ icon ] msg` — bracket spinner follows the badge; `parsePrettyLine` updated to check badge remainder
- Browser CSS color mode: badge rendered without brackets (`   INFO    <scope>`) and spinner icon is a bare `-/✔/✖` character after the scope — `parseBrowserLine` updated with `noBracketBadgeMatch` path
- TTY color mode: badge rendered as ANSI escape sequence without brackets — OPT-03 check made tolerance-aware
- Browser TRACE_LEVELS: `console.groupCollapsed` emits stack trace lines starting with `at ` — filtered in `parseBrowserLine`

# Feature Research

**Domain:** Test suite for a multi-environment structured logger library (@lalex/console)
**Researched:** 2026-03-24
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Must-Test — Core Logging)

Features every logger test suite covers. Missing these means untested core behavior.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Level method dispatch** | All 11 level methods (emerg→wth) must emit correctly | LOW | One test per level; verify console method mapping (error→console.error, info→console.info, etc.) |
| **Level filtering** | `Logger.level = 'warn'` must suppress info/debug/etc. | LOW | Test numeric severity comparison; boundary cases (exact match emits, one above suppresses) |
| **Enabled/disabled toggle** | `Logger.enabled = false` must suppress all output | LOW | Test root and scope independently; also test `LLOGGER_ENABLED=false` env var |
| **Structured output — JSON** | `format='json'` must produce valid, parseable JSON with correct fields | MEDIUM | Capture stdout; validate `time`, `level`, `severity`, `msg`, `data` fields; test with objects, arrays, strings |
| **Structured output — logfmt** | `format='logfmt'` must produce key=value pairs | MEDIUM | Capture stdout; validate field ordering and quoting rules |
| **Structured output — pretty** | `format='pretty'` must render ANSI-prefixed human-readable lines | MEDIUM | Capture stdout; verify prefix structure and content |
| **Browser devtools output** | Browser mode must use `%c` CSS format strings and correct console methods | MEDIUM | rstest browser mode; capture console calls; verify CSS array and groupCollapsed for trace levels |
| **Prefix pipeline — level badge** | Every log line must carry the correct level label | LOW | Verify label text, severity number, ANSI color codes |
| **Prefix pipeline — date** | `Logger.date = true` must prepend ISO timestamp | LOW | Verify ISO 8601 format in output; mock Date.now for determinism |
| **Prefix pipeline — scope** | Scoped loggers must include scope name in prefix | LOW | Create scope, verify scope string appears in output |
| **Prefix pipeline — caller** | `Logger.stack = true` must append file:line:col | MEDIUM | Verify caller info format; stack frame offset correctness |
| **Option getters/setters** | All options (enabled, level, pad, color, date, stack, uid, inspect) must read/write correctly | LOW | Test each getter returns computed value; setter persists to state |
| **Option cascading** | Own options > root options > defaults; strictest level wins | MEDIUM | Create scope with partial options; verify cascade priority; test level strictness rule |
| **util.inspect integration** | Non-string args in Node must be formatted via util.inspect | LOW | Pass objects, verify inspect options (depth, colors) are forwarded |
| **Error handling in emit** | Errors during log emission must never propagate to user code | LOW | Force an error in the render path; verify no throw + fallback to console.error |
| **Log suppression guards** | Disabled logger, wrong level, missing method — all must return silently | LOW | Verify no output for each guard condition |

### Table Stakes (Must-Test — Scoped Loggers)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Scope creation** | `Logger.scope('name')` must return a ScopeLogger with scope name | LOW | Verify returned object has all level methods + scope property |
| **Scope caching** | Same name must return same instance | LOW | `Logger.scope('x') === Logger.scope('x')` |
| **Scope option inheritance** | Scope inherits root options via computeOptions cascade | MEDIUM | Set root option, verify scope inherits; set scope option, verify override |
| **Scope independence** | Each scope has its own state; mutations don't leak | LOW | Create two scopes, modify one, verify other unchanged |
| **Scope + level filtering** | Scope respects the strictest level across own + root | MEDIUM | Set different levels on root vs scope; verify the stricter wins |

### Table Stakes (Must-Test — Mixins)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **once() rate limiting** | `Logger.once()` must emit exactly once per call-site | MEDIUM | Call in a loop; verify single emission; verify different call-sites are independent |
| **limit(n) rate limiting** | `Logger.limit(n)` must emit exactly n times per call-site | MEDIUM | Call n+5 times; verify exactly n emissions |
| **limit() with explicit key** | Custom key groups disparate call-sites under one counter | LOW | Call from two locations with same key; verify shared counter |
| **options() one-shot override** | `Logger.options({ color: false }).info('x')` applies overrides to one call only | MEDIUM | Verify override applied; verify next call uses original options |
| **options() returns GenericLogger** | Returned object has all level methods + spin/exec as noops | LOW | Verify shape of returned object |

### Table Stakes (Must-Test — Singleton & Registry)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Singleton identity** | `Logger` is always the same instance across imports | LOW | Import from two paths; `===` check |
| **globalThis registry** | Registry survives across module loads | MEDIUM | Verify `globalThis['$logger-registry']` exists and holds root |
| **exclusive lock** | `Logger.exclusive = true` silences all other loggers | MEDIUM | Create scope, set exclusive on root, verify scope silenced; release and verify restored |
| **format getter/setter** | `Logger.format` reads/writes `registry.format` | LOW | Set, read, verify output changes |

### Table Stakes (Must-Test — Console Integration)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **patch()** | Replaces native console.log/info/debug/warn/error with logger methods | MEDIUM | Call console.log after patch; verify it routes through logger |
| **unpatch()** | Restores original console methods | LOW | Call unpatch; verify console.log === original |
| **bypass(console)** | Redirects output to custom console object | LOW | Pass mock console; verify output goes to mock |
| **restore()** | Reverts bypass to system console | LOW | Call restore after bypass; verify output returns to system console |

### Differentiators (Advanced — Spinner System)

Features that are complex, runtime-specific, and set this library apart. High-value test targets.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Spinner lifecycle (start → update → success/fail/stop)** | Verifies core spinner state machine works correctly | HIGH | Test each transition; verify stopped=true is terminal; verify idempotent success/fail after stop |
| **Spinner autoStart** | `autoStart: true` (default) starts immediately; `false` requires explicit `.start()` | LOW | Verify both paths |
| **Spinner duration display** | `duration: true` shows elapsed time in success/fail message | MEDIUM | Mock timers; verify formatted duration appears in output |
| **Spinner progress bar** | `progress: true` enables progress updates via `.update()` | MEDIUM | Update with ratio (0-1) and {done, total}; verify progress prefix item |
| **Spinner progress auto-complete** | success() infers 100% if last update had progress | LOW | Update with progress, then success without; verify 100% |
| **Sequential spinner timer jitter** | setTimeout intervals have random jitter | LOW | Verify interval ≈ base ± SPINNER_INTERVAL_JITTER |
| **exec() promise wrapper** | `.exec(promise)` shows spinner during async work, marks success/fail | MEDIUM | Test resolved promise → success; rejected → fail + re-throw |
| **TTY spinner rendering** | ttyRenderer manages cursor, multi-spinner layout, log queue | HIGH | Mock process.stdout.write; verify cursor movement sequences, spinner frame cycling |
| **Console spinner rendering** | Non-TTY spinner emits ANSI icon badges (no cursor control) | MEDIUM | Capture stdout; verify badge format |
| **Browser spinner rendering** | CSS-styled badges + progress bars for devtools | HIGH | rstest browser mode; verify %c format strings and CSS |
| **Spinner + scoped logger** | Spinners on scoped loggers include scope in prefix | LOW | Create scope, spin on scope level method, verify scope in output |
| **Multiple concurrent spinners** | TTY renderer handles N spinners simultaneously | HIGH | Start 3 spinners; update/succeed independently; verify no cross-contamination |
| **Spinner log interleaving** | Normal logs queue behind active TTY spinners | HIGH | Start spinner, emit log, verify log appears above spinner area |

### Differentiators (Advanced — Worker Proxy)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Worker proxy log dispatch** | `WL.info('x')` sends WorkerMessage and worker emits correctly | HIGH | Need worker process; verify message arrives and logger emits |
| **Worker proxy — all message types** | log, spin:*, opt:set, opt:format, opt:exclusive all handled | HIGH | Test each WorkerMessage variant |
| **Worker proxy — structuredClone fallback** | Unserializable args fall back to String() then '[unserializable]' | MEDIUM | Pass function or symbol; verify fallback |
| **Worker proxy — message buffering** | Messages before transport ready are queued and flushed | HIGH | Post messages immediately after import; verify all received after transport ready |
| **Worker proxy — caller capture** | stack=true captures call-site in main process before IPC | MEDIUM | Enable stack on WL; verify caller appears in worker output |
| **Worker proxy — TRACE_LEVELS caller** | emerg/alert/crit always capture trace caller | MEDIUM | Call WL.emerg; verify traceCaller in output |
| **Worker proxy — scoped logger** | `WL.scope('x')` sends scope info in WorkerMessage | MEDIUM | Call WL.scope('x').info; verify scope in worker output |
| **Worker proxy — rate limiting** | WL.once()/WL.limit() sends key/max over IPC | HIGH | Call WL.once() multiple times; verify worker counter |
| **Worker proxy — spinner over IPC** | WL.info.spin() sends spin:start/update/success/fail messages | HIGH | Start spinner via proxy; verify worker receives lifecycle messages |
| **terminateWorker()** | Kills worker, activates fallback logger, idempotent | MEDIUM | Call terminate; verify fallback active; call again; verify no-op |
| **Worker proxy — option sync** | Setting WL.stack/WL.enabled mirrors to proxy state + sends opt:set | LOW | Set option; verify both proxy flag and WorkerMessage sent |

### Differentiators (Advanced — Cross-Environment)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Environment detection** | isNode, isBrowser, isNodeTTY, isMainBrowser, isWebWorker all correct | MEDIUM | Need Node tests + browser tests; potentially mock process/window |
| **TRACE_LEVELS stack trace** | emerg/alert/crit show stack trace even when stack=false | MEDIUM | Call Logger.emerg; verify stack trace in output; add error/warn per PROJECT.md |
| **Browser groupCollapsed for trace levels** | Browser uses console.groupCollapsed for emerg/alert/crit | MEDIUM | rstest browser mode; verify groupCollapsed + groupEnd calls |
| **UID tracking** | `Logger.uid = true` prepends `{_uid: #N}` before objects | LOW | Pass same object twice; verify same UID; pass different; verify different UID |
| **Color toggle** | `Logger.color = false` suppresses ANSI codes in output | LOW | Disable color; verify no ANSI escape sequences in stdout |
| **Pad toggle** | `Logger.pad = true` pads level labels to uniform width | LOW | Enable pad; verify all labels are same character width |

### Anti-Features (Do NOT Test — Counterproductive)

Things that seem testable but are counterproductive to include in the test suite.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Exact ANSI escape code sequences** | "Verify exact color output" | Brittle; codes depend on terminal capabilities and color library internals; any style tweak breaks tests | Test that color output differs from no-color output; snapshot for visual regression, not byte-exact |
| **Exact spinner frame characters** | "Verify ⠋⠙⠹⠸... sequence" | Implementation detail; frame set may change; tests break on style updates | Verify frames are cycling (changed between ticks); don't assert specific characters |
| **Timer precision** | "Spinner ticks at exactly 80ms" | setTimeout is not precise; CI machines are slow; flaky by design | Verify tick count is reasonable (≥1 tick per interval); use fake timers |
| **TTY cursor position arithmetic** | "Verify cursor moved to row 5, col 0" | Couples tests to terminal size, number of lines written; breaks on any layout change | Verify ANSI cursor sequences are present; don't assert absolute positions |
| **Visual styling correctness** | "Verify the output looks right" | Cannot automate visual aesthetics; "looks right" is subjective | Use snapshot tests for regression detection; manual local visual checks for TTY mode |
| **globalThis pollution side effects** | "Test registry cleanup between tests" | The singleton is intentionally persistent; fighting it creates test isolation nightmares | Use test hooks to reset registry state; accept singleton as architectural constraint |
| **structuredClone internals** | "Test which types are cloneable" | Platform behavior, not library behavior | Only test library's fallback chain when clone fails |
| **Third-party util.inspect formatting** | "Verify exact inspect output" | Node version-dependent; format changes between Node releases | Verify inspect is called with correct options; don't assert output format |
| **Private/internal function unit tests** | "Test computeOptions, prepareLog, emit individually" | Over-mocking internals; refactoring breaks all tests; tests don't reflect real usage | Test through public API; internal functions are exercised transitively |
| **Full E2E worker process tests in CI** | "Fork real child process, capture stdout" | Slow, flaky (process startup, IPC timing); hard to debug; CI-hostile | Test protocol serialization + message handling separately; integration test locally |

## Feature Dependencies

```
[Level method dispatch]
    └──requires──> [Level definitions (LEVEL_METHODS, LogLevels)]

[Level filtering]
    └──requires──> [Level method dispatch]
    └──requires──> [Option getters/setters]

[Structured output (json/logfmt/pretty)]
    └──requires──> [Prefix pipeline]
    └──requires──> [Format getter/setter]

[Browser devtools output]
    └──requires──> [Prefix pipeline — renderBrowserPrefix]
    └──requires──> [Environment detection (isBrowser)]

[Scope creation]
    └──requires──> [Singleton registry]
    └──requires──> [Option cascading]

[once() / limit() rate limiting]
    └──requires──> [Level method dispatch]
    └──requires──> [Stack introspection (call-site key)]

[Spinner lifecycle]
    └──requires──> [Level method dispatch]
    └──requires──> [Prefix pipeline (extraPrefixItems)]
    └──requires──> [Environment detection (platform factory selection)]

[TTY spinner rendering]
    └──requires──> [Spinner lifecycle]
    └──requires──> [ttyRenderer (cursor manager)]

[exec() promise wrapper]
    └──requires──> [Spinner lifecycle]

[Worker proxy log dispatch]
    └──requires──> [WorkerMessage protocol]
    └──requires──> [Level method dispatch (in worker)]
    └──requires──> [structuredClone / fallback chain]

[Worker proxy — spinner over IPC]
    └──requires──> [Worker proxy log dispatch]
    └──requires──> [Spinner lifecycle (in worker)]

[Worker proxy — rate limiting]
    └──requires──> [Worker proxy log dispatch]
    └──requires──> [once() / limit() (in worker)]

[TRACE_LEVELS stack trace]
    └──requires──> [Stack introspection]
    └──requires──> [Level method dispatch]

[patch() / unpatch()]
    └──requires──> [Level method dispatch]
    └──requires──> [Original console method capture]

[options() one-shot override]
    └──requires──> [Option cascading]
    └──requires──> [Level method dispatch]
```

### Dependency Notes

- **Structured output requires Prefix pipeline:** JSON/logfmt serializers consume the `Prefix[]` array; prefix must work before structured output can be tested.
- **Spinner lifecycle requires Environment detection:** `selectSpinnerFactory()` picks TTY/console/browser factory at runtime; environment must be controllable.
- **Worker proxy requires protocol + worker-side logger:** Testing the proxy in isolation requires mocking the transport; full integration requires the worker script.
- **Rate limiting requires stack introspection:** `getLimitCallerKey()` uses `Error.stack` to derive call-site keys; this works differently in V8 vs SpiderMonkey.
- **TRACE_LEVELS requires updating:** PROJECT.md notes adding `error` and `warn` to TRACE_LEVELS — tests should be written for the updated set.

## MVP Definition

### Launch With (v1 — Core Tests)

Minimum test suite to catch regressions in daily development.

- [x] Level method dispatch — all 11 levels emit to correct console method
- [x] Level filtering — severity boundary correctness
- [x] Enabled/disabled — root and scope suppression
- [x] Structured output — JSON valid and complete; logfmt parseable
- [x] Prefix pipeline — level, date, scope, caller all produce correct Prefix items
- [x] Option cascading — priority order and strictest-level rule
- [x] Scope creation + caching + independence
- [x] once() / limit() — correct rate limiting with counter map
- [x] options() one-shot — applies once, doesn't persist
- [x] Exclusive lock — silences non-holders
- [x] patch() / unpatch() — console method replacement/restoration
- [x] Error handling — emit never throws to user

### Add After Validation (v1.x — Environment-Specific)

Tests requiring environment-specific infrastructure (rstest browser mode, TTY mocking).

- [ ] Browser devtools output — %c CSS, groupCollapsed, console method mapping
- [ ] TTY spinner rendering — cursor control, multi-spinner, log interleaving
- [ ] Console spinner rendering — ANSI icon badges
- [ ] Browser spinner rendering — CSS badges + progress bars
- [ ] Environment detection — isNode/isBrowser/isNodeTTY correctness across runtimes
- [ ] TRACE_LEVELS with error/warn — after TRACE_LEVELS update

### Future Consideration (v2+ — Worker & Integration)

Tests requiring worker infrastructure.

- [ ] Worker proxy — message buffering and flush
- [ ] Worker proxy — all WorkerMessage types
- [ ] Worker proxy — spinner over IPC
- [ ] Worker proxy — rate limiting over IPC
- [ ] Worker proxy — terminateWorker + fallback
- [ ] Cross-module singleton dedup (CJS + ESM dual load)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Level dispatch + filtering | HIGH | LOW | P1 |
| Enabled/disabled toggle | HIGH | LOW | P1 |
| Structured output (json/logfmt) | HIGH | MEDIUM | P1 |
| Prefix pipeline | HIGH | LOW | P1 |
| Option cascading | HIGH | MEDIUM | P1 |
| Scope creation + inheritance | HIGH | LOW | P1 |
| once() / limit() rate limiting | HIGH | MEDIUM | P1 |
| options() one-shot override | MEDIUM | LOW | P1 |
| Exclusive lock | MEDIUM | LOW | P1 |
| patch() / unpatch() | MEDIUM | LOW | P1 |
| Error handling in emit | HIGH | LOW | P1 |
| Browser devtools output | HIGH | HIGH | P2 |
| Spinner lifecycle | HIGH | HIGH | P2 |
| TTY spinner rendering | MEDIUM | HIGH | P2 |
| Console spinner rendering | MEDIUM | MEDIUM | P2 |
| Browser spinner rendering | MEDIUM | HIGH | P2 |
| exec() promise wrapper | MEDIUM | MEDIUM | P2 |
| Multiple concurrent spinners | MEDIUM | HIGH | P2 |
| TRACE_LEVELS stack trace | MEDIUM | MEDIUM | P2 |
| Environment detection | MEDIUM | MEDIUM | P2 |
| UID tracking | LOW | LOW | P2 |
| Worker proxy — log dispatch | MEDIUM | HIGH | P3 |
| Worker proxy — message types | MEDIUM | HIGH | P3 |
| Worker proxy — buffering | MEDIUM | HIGH | P3 |
| Worker proxy — spinner IPC | LOW | HIGH | P3 |
| Worker proxy — rate limiting IPC | LOW | HIGH | P3 |
| terminateWorker() | LOW | MEDIUM | P3 |
| Cross-module singleton dedup | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have — core logging correctness; catches 80% of regressions
- P2: Should have — environment-specific and advanced features; requires test infrastructure
- P3: Nice to have — worker system; high setup cost, lower change frequency

## Test Strategy Notes

### Console Mode (Node CI) — Simplest to Test
- Capture `process.stdout.write` or spy on console methods
- JSON/logfmt output is deterministic and parseable — ideal for assertions
- Pretty mode: verify prefix strings without exact ANSI matching

### Browser Mode — Requires rstest Browser Mode
- Spy on `console.log`, `console.groupCollapsed`, etc.
- Verify CSS array structure (`%c` substitutions)
- DevTools-specific behaviors (groupCollapsed for trace levels)

### TTY Mode — Hardest to Test
- Mock `process.stdout.write` + `process.stdout.isTTY`
- Verify ANSI control sequences are present (cursor up, erase line)
- Snapshot-based regression: capture full output, compare
- Visual validation: local-only manual check (not CI)

### Cross-Mode Pattern
- Many features (level filtering, option cascading, scopes) are mode-independent
- Test core logic in Node console mode (cheapest); verify rendering in each mode separately
- Separate "logic" tests from "rendering" tests

## Sources

- Codebase analysis: `src/logger/index.ts`, `src/types.ts`, `src/levels.ts`, `src/worker/`
- Architecture: `.planning/codebase/ARCHITECTURE.md`
- Project context: `.planning/PROJECT.md`
- Testing patterns informed by: pino, winston, consola test suites (general patterns, not direct code)

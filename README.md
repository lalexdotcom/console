# @lalex/console

Because `console.log` deserves better than a lifetime of being ignored in production.

An isomorphic TypeScript logger for Node.js and the browser.

- 🎚️ **11 syslog-style severity levels** with configurable filtering
- 🌍 **Environment-aware rendering** — ANSI color in TTY, structured `json`/`logfmt` in CI/pipes, CSS-styled groups in browser devtools
- 🌀 **Animated spinners** — in-place rewrite on TTY, sequential ticks in console/browser, multiple concurrent spinners
- 📊 **Progress bars** — ratio (`0–1`) or `done/total` pair, rendered inline in TTY spinners
- **Scoped loggers** — inherit and override options per subsystem
- **Rate limiting** — `.once()` / `.limit(n)` per call-site
- **One-shot overrides** — `.options({})` for a single log call
- **`console.*` patching** — redirect native console methods through the logger
- **Singleton registry** on `globalThis` — survives CJS + ESM dual-load

---

## Installation

```bash
pnpm add @lalex/console
```

---

## Quick start

```ts
import { L } from '@lalex/console'

L.info('Server started', { port: 3000 })
L.warn('Low memory', { free: '128MB' })
L.error('Unhandled exception', err)
```

---

## Log levels

Levels follow the syslog severity scale. Only messages at or below the configured `level` are emitted.

| Method | Label | Severity |
|---|---|---|
| `L.emerg()` | `EMERGENCY` | 0 — highest |
| `L.alert()` | `ALERT` | 1 |
| `L.crit()` | `CRITICAL` | 2 |
| `L.error()` | `ERROR` | 3 |
| `L.warn()` | `WARNING` | 4 |
| `L.notice()` | `NOTICE` | 5 |
| `L.success()` | `SUCCESS` | 6 |
| `L.info()` | `INFO` | 7 |
| `L.verb()` | `VERBOSE` | 8 |
| `L.debug()` | `DEBUG` | 9 |
| `L.wth()` | `WHO CARES?` | 10 — lowest |

```ts
L.level = 'warn' // only emerg → warn are emitted
```

---

## Configuration

All options can be set on the root logger at any time.

```ts
L.enabled = false         // silence all output
L.level   = 'info'        // filter threshold
L.color   = false         // disable ANSI / CSS colors
L.date    = true          // prepend timestamp to every line
L.stack   = true          // append call-site (file:line)
L.pad     = false         // disable label padding (Node TTY only)
L.uid     = true          // prefix object references with #UID
L.format  = 'json'        // 'pretty' | 'json' | 'logfmt' (non-TTY Node only)
```

### Environment variables

| Variable | Effect |
|---|---|
| `LLOGER_FORCE_CONSOLE=true` | Force non-TTY (console) mode even when a TTY is attached |
| `LLOGGER_ENABLED=false` | Disable all output globally |

---

## Scoped loggers

```ts
const db = L.scope('db')
const api = L.scope('api', { level: 'warn' })

db.info('Connected')          // prefix: [db]
api.warn('Rate limit reached') // prefix: [api], filtered to warn+
```

Scopes inherit root options and can override any of them independently.

---

## Spinners

### Basic spinner

```ts
const spinner = L.info.spin('Loading data…')

spinner.update('Still loading…')
spinner.success('Done!')
// or
spinner.fail('Something went wrong')
```

### Spinner with progress

```ts
const spinner = L.info.spin('Uploading', { progress: true })

// ratio
spinner.update('Uploading…', { progress: 0.42 })

// done / total
spinner.update('Uploading…', { progress: { done: 3, total: 7 } })

spinner.success('Upload complete')
```

### Icon overrides

```ts
spinner.update('Waiting…', { icon: '⏳' })   // fixed icon
spinner.update('Waiting…', { icon: '' })      // no icon
spinner.update('Waiting…', { icon: null })    // reset to animation
```

### Force console spinner (non-TTY style in a TTY)

```ts
const spinner = L.info.spin('Processing…', { console: true })
```

### `exec` shorthand

Wraps a promise: starts a spinner, calls `success` or `fail` automatically.

```ts
const result = await L.info.exec(fetchData(), { label: 'Fetching data' })
```

---

## Rate limiting

Counters are tracked per call-site (source file + line).

```ts
L.warn.once()('This warning appears exactly once per program run')

L.debug.limit(5)('This debug line appears at most 5 times')
```

Use an explicit key to share a counter across multiple call-sites:

```ts
const limited = L.info.limit(3, 'shared-key')
```

---

## One-shot overrides

```ts
// Emit a single line with date enabled, without changing global state
L.options({ date: true }).info('Timestamped message')
```

---

## Console patching

Redirect native `console.*` methods through the logger:

```ts
L.patch()
// console.log → L.info, console.warn → L.warn, etc.

L.unpatch() // restore originals
```

---

## Utilities

### `colorize`

Apply ANSI color to a string (Node) or return a CSS string (browser):

```ts
import { colorize, STYLES } from '@lalex/console'

console.log(colorize('hello', { color: 'green' }))
```

Available colors: `black`, `grey`, `white`, `red`, `green`, `yellow`, `orange`, `blue`, `dodgerblue`, `cyan`.

---

## Development

```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Watch mode
pnpm run dev

# Lint
pnpm run lint

# Format
pnpm run format
```

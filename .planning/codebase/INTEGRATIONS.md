# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**None.** This is a self-contained logging library with zero external service dependencies. It does not connect to any APIs, databases, cloud services, or third-party platforms.

## Data Storage

**Databases:**
- None — The library produces log output; it does not persist data.

**File Storage:**
- None — Output goes to stdout/stderr via `console.*` methods. No file transport exists.

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- Not applicable — Pure utility library with no authentication requirements.

## Monitoring & Observability

**Error Tracking:**
- None — The library itself is the observability tool. No external error tracking services integrated.

**Logs:**
- The library IS the logging layer. Output formats:
  - **JSON** — Structured JSON lines via `serializeJSON()` in `src/logger/prefix/serialize.ts`
  - **logfmt** — Key-value structured format via `serializeLogfmt()` in `src/logger/prefix/serialize.ts`
  - **Pretty** — ANSI-colored human-readable output via `renderTTYPrefix()` / `renderConsolePrefix()` in `src/logger/prefix/render.ts`
  - **Browser** — CSS-styled `console.*` output via `renderBrowserPrefix()` in `src/logger/prefix/render.ts`

## CI/CD & Deployment

**Hosting:**
- Published to npm as `@lalex/console`
- Repository: `https://github.com/lalexdotcom/console`

**CI Pipeline:**
- Not detected in this workspace (no `.github/workflows/`, no CI config files found)

## Environment Configuration

**Required env vars:**
- None required for library consumers

**Optional env vars:**
- `LLOGER_FORCE_CONSOLE` — Forces non-TTY console mode (used in `src/utils/env.ts`)

**Secrets:**
- None — No `.env` files detected, no secrets required

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Internal Communication Protocols

### Worker Transport (`src/worker/`)

The library implements an inter-thread communication protocol for offloading log output from the main thread to a worker thread. This is the only "integration" in the codebase — it is internal, not external.

**Protocol:** `WorkerMessage` discriminated union (defined in `src/worker/protocol.ts`)

Message types:
| Type | Direction | Purpose |
|------|-----------|---------|
| `log` | Main → Worker | Send a log line with level, args, optional scope, caller info, and timestamp |
| `spin:start` | Main → Worker | Start a spinner in the worker |
| `spin:update` | Main → Worker | Update spinner text/progress |
| `spin:success` | Main → Worker | Mark spinner as succeeded |
| `spin:fail` | Main → Worker | Mark spinner as failed |
| `spin:stop` | Main → Worker | Stop a spinner |
| `opt:set` | Main → Worker | Set a logger option |
| `opt:format` | Main → Worker | Set output format |
| `opt:patch` | Main → Worker | Batch-patch console |
| `opt:exclusive` | Main → Worker | Set exclusive lock |
| `scope:opt` | Main → Worker | Set scope-level options |
| `terminate` | Main → Worker | Shutdown the worker |
| `ready` | Worker → Main | Confirm worker is alive |

**Serialization:** `structuredClone` algorithm (native to both Node IPC and Web Worker `MessageChannel`). Arguments are pre-cloned via `structuredClone()` with fallback to `String()` in `src/worker/limit.ts` and `src/worker/proxy.ts`.

### Node.js Transport

- **Mechanism:** `child_process.fork()` with inherited stdio
- **Loaded via:** Dynamic `import('node:child_process')` in `src/worker/proxy.ts` (ESM-safe)
- **Worker script:** `src/worker/worker.ts` → built to `dist/worker/worker.js`
- **The fork owns stdout/TTY** — main thread silences its logger when the fork is ready
- **Async init, sync API:** Messages are buffered in a queue until the fork sends `ready`, then flushed in order

### Browser Transport

- **Mechanism:** `new Worker()` using `import.meta.url`-resolved script
- **Worker script:** Same `src/worker/worker.ts`, bundled for browser by Rslib
- **Script path:** Injected at build time via `__WORKER_SCRIPT__` compile-time constant (`rslib.config.ts`)
- **Dev fallback:** When running via tsx without build, falls back to `'./worker.ts'` source path

### Environment Detection (`src/utils/env.ts`)

The library auto-detects its runtime environment and adapts output accordingly:

| Flag | Detection | Effect |
|------|-----------|--------|
| `isNode` | `process?.versions?.node != null` | Enables ANSI output, `util.inspect`, fork transport |
| `isMainBrowser` | `window.document` exists | Enables CSS-styled console output |
| `isWebWorker` | Not Node, no `window`, has `self` | Identifies Web Worker context |
| `isBrowser` | `isMainBrowser \|\| isWebWorker` | Browser-specific rendering |
| `isNodeTTY` | `process.stdout.isTTY` and no `LLOGER_FORCE_CONSOLE` | Enables animated TTY spinners, ANSI colors |
| `isNodeConsole` | `isNode && !isNodeTTY` | Piped/CI mode — structured output, no animations |

### `util.inspect` Loading (`src/utils/env.ts`)

Node's `util.inspect` is lazy-loaded via an obfuscated `require()` call to prevent static bundler analysis from trying to bundle the Node built-in or emitting warnings:
```typescript
require(`${'util'}`)?.inspect
```
Returns `undefined` in browser contexts.

## Singleton Registry (`src/logger/index.ts`)

The logger uses a `globalThis`-based singleton registry (`globalThis['$logger-registry']`) to survive CJS + ESM dual-load scenarios. This is not an external integration but an internal resilience mechanism. The registry tracks:
- Root logger instance
- Root options
- Scoped loggers
- Exclusive lock state
- Output format

---

*Integration audit: 2026-03-24*

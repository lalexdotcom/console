---
phase: 4
phase_name: Worker Proxy & API Alignment
created: 2026-03-25
---

<decisions>

## Transport Testing Strategy

**Decision: Hybrid — mock for unit tests (WORK-01..08), real WL proxy for WORK-09**

- **Unit/protocol tests (WORK-01..08):** Inject a fake `post()` function into the
  proxy transport to capture serialized `WorkerMessage` objects. Fast, deterministic,
  no process management overhead. Tests verify what messages are sent and in what order.
- **E2E test (WORK-09):** Import `WL` and `terminateWorker` directly, spawn the real
  worker via the proxy's own transport, and call `terminateWorker()` through the proxy
  public API — not through `child_process.fork()` directly. This exercises the full
  production code path including fallback activation.
- **Out of scope:** Browser `new Worker()` tests (no browser worker test project in
  rstest.config.ts; Node fork covers the protocol).

## Test File Structure

**Decision: Two files**

- `tests/node/main/worker-protocol.test.ts` — WORK-01..08 (mocked transport, fast)
- `tests/node/main/worker-e2e.test.ts` — WORK-09 (real WL proxy, fork-based) + API-01

## API-02 (README + JSDoc)

**Decision: Deferred — not in Phase 4 scope**

Phase 4 is test-only. Documentation updates are a separate concern and will not block
Phase 4 completion. API-02 is moved to a future docs phase.

## API-01 Verification Approach

**Decision: Both — type assertion + runtime key enumeration**

- **Type-level:** Verify `WL` satisfies the `RootLogger` type (same as `L`) using
  TypeScript assignability (no `ts-expect-error` failures).
- **Runtime:** `Object.keys(WL)` enumeration compared against known public surface
  (`Object.keys(L)` or a hand-listed set of expected methods).
  Both checks go in `worker-e2e.test.ts`.

## Transport Mock Pattern

The worker proxy transport is initialised lazily via dynamic `import('node:child_process')`.
There is no injectable `post()` parameter on the public API — the transport is internal.

**Approach for unit tests:** Instead of injecting a fake transport, intercept at the
`WorkerMessage` level by wrapping `child_process.fork` via `rs.mock` (hoisted), and
capture messages posted via `process.send` on the fake fork handle. This gives
full control over the IPC channel without spawning a real process.

Alternatively, if `rs.mock('node:child_process')` has the same rspack-bundle capture
problem as `rs.mock('../../../src/utils/env')` (Phase 03 RISK-1), fall back to importing
the internal `proxy.ts` send function directly and testing the message shapes from there.

The canary assertion for WORK-01 is: after `WL.info('test')`, a `{ type: 'log', level: 'info' }`
message must appear in the captured queue. If this fails, switch to fallback.

## Rate-Limiting (WORK-07)

The proxy sends `{ key, max }` fields on `WorkerMessage` type `'log'`. The counter
lives in the worker — the proxy's `.once()` / `.limit()` only adds the key/max to the
message, it does NOT maintain a local counter. This means the WORK-07 test verifies
that the POST message carries the correct `key` and `max` fields, not that the proxy
itself deduplicates calls.

## Callsite Capture (WORK-01)

The proxy captures call-site info before posting when `_captureStack === true` (opt:set
with `key === 'stack'`). Tests for caller/traceCaller fields must first send an `opt:set`
message setting `stack: true` on the worker proxy.

## Spinner IDs (WORK-08)

The worker proxy uses `crypto.randomUUID()` (or `Math.random().toString(36)` fallback)
for spinner IDs — string UUIDs, not `Symbol`. This is important: test assertions on
`spin:start` messages should check `typeof id === 'string'`, not `typeof id === 'symbol'`.

</decisions>

<specifics>
- Files to create: `tests/node/main/worker-protocol.test.ts`, `tests/node/main/worker-e2e.test.ts`
- No new directories needed (tests/node/main/ already exists)
- API-02 explicitly deferred — researcher and planner should NOT include README or JSDoc changes
- Worker entry point: `import { WL, WorkerLogger, terminateWorker } from '@lalex/console/worker'`
  (or the path equivalent: `'../../../src/worker/index'`)
</specifics>

<deferred>
- API-02: README and JSDoc updates — future docs phase
</deferred>

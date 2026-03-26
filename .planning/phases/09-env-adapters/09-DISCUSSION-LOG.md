# Phase 09 — Discussion Log

**Phase:** 09-env-adapters
**Date:** 2026-03-26
**Participants:** Developer + Copilot

---

## Gray Areas Identified

Four decision points were identified during the discuss-phase inquiry:

1. **TTY capture strategy** — how to intercept ttyRenderer ANSI output from captureAll
2. **Worker IPC drain** — latency strategy before asserting on captured output
3. **Worker suite parity** — which shared suites each worker adapter covers
4. **Adapter file placement** — inline in battery file vs separate file

---

## Discussion Transcript

### D-01 · TTY Capture Strategy

**Question presented:** ttyRenderer emits ANSI cursor-control sequences via `process.stdout.write`.
Shared suites assert on plain text. How should the TTY adapter's `capture()` return clean output?

Options:
- A) `captureAll()` + `stripVTControlCharacters` inside `capture()` ← chosen
- B) Rewrite suites with TTY-aware regex
- C) Route ttyRenderer through a separate channel

**Decision:** Option A — `captureAll()` + `stripVTControlCharacters` in `capture()`.
Suites see clean text. No changes to shared suites needed.

---

### D-02 · Worker Drain Strategy

**Question presented:** WorkerLogger sends messages over IPC. There is a latency between
`WL.info(…)` and the output appearing on the main process. How to drain before asserting?

Options:
- A) Fixed `setTimeout(r, 50)` ← chosen
- B) Event-based flush (await IPC ack)
- C) Hook into releaseWorker() response cycle

**Decision:** Option A — fixed 50ms drain. Consistent with worker-protocol.test.ts pattern.
Simple, no coupling to internals.

---

### D-03 · Suite Coverage for Worker Adapters

**Question presented:** Should worker adapters run all 7 suites or a subset? Should both
worker adapters (console and tty) run the same number of suites?

**Decision:**
- `node-console-worker`: 7 suites — same as node-console main (formats included)
- `node-tty-worker`: 6 suites — same as node-tty (formats excluded, TTY always pretty)
Each worker runs exactly the same suites as its "main" counterpart.

---

### D-04 · Adapter File Placement

**Question presented:** Should adapters be defined inline in their battery files or in
separate adapter modules?

**Decision:** Inline — consistent with Phase 08 pattern for node-console and browser battery
files. No separate adapter file.

---

## Final Decisions Summary

| ID   | Topic              | Decision                                                  |
|------|--------------------|-----------------------------------------------------------|
| D-01 | TTY capture        | captureAll() + stripVTControlCharacters in capture()      |
| D-02 | Worker drain       | setTimeout(r, 50) after fn(), before captureAll           |
| D-03 | Suite coverage     | node-console-worker=7, node-tty-worker=6 (same as mains)  |
| D-04 | Placement          | Inline in battery files                                   |

**Note captured during session:**
> les formats (json/logfmt/pretty) ne sont utilisés que par le mode console, ils ne devraient pas être dans le répertoire common.
Saved to `.planning/notes/2026-03-26-formats-console-mode-only.md`.

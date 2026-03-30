# Phase 13: Directory Restructure — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27

---

## Gray Areas Discussed

Four areas were selected by the user for discussion.

---

### 1. Standalone node tests

**Question asked:** What to do with `formats.test.ts`, `levels.test.ts`, `mixins.test.ts`,
`options.test.ts`, `prefix.test.ts`, `scopes.test.ts`, `spinner-node.test.ts` in `tests/node/main/`?

**Context provided:** 748 lines total; use `captureAll()` (sync); test similar ground to shared
suites; STRUCT-04 does not list them in the preservation whitelist. User confirmed they
do NOT contain `releaseWorker` logic.

**Options presented:**
1. Delete all 7 — covered by suites *(recommended)*
2. Keep in place — defer to Phase 14
3. Audit case by case

**User selection:** Delete all 7.

**Captured as D-01.**

---

### 2. Parity files

**Question asked:** What to do with `parity-console.test.ts`, `parity-tty.test.ts`,
`parity.suite.ts`? (D-06 from Phase 12 deferred this here.)

**Context provided:** These files call `makeParitySuite(mainAdapter, workerAdapter)`.
Phase 12 kept `parity.suite.ts` alive only because these two test files imported it.
Parity is now fully integrated into `runSuite()` via `tc.parity !== false`.

**Options presented:**
1. Delete all 3 *(recommended)*
2. Keep in place as non-shared tests
3. Merge logic into new index.test.ts files

**User selection:** Delete all 3.

**Captured as D-02.**

---

### 3. Worker battery placement

**Question asked:** Where do the worker-adapter tests (`battery-node-console-worker.test.ts`,
`battery-node-tty-worker.test.ts`) live in the new structure?

**Options presented:**
1. `index.test.ts` runs both main + worker per format dir *(recommended)*
2. Separate `worker.test.ts` per format dir
3. Keep battery-worker files in place

**User selection:** `index.test.ts` runs main + worker per format.

**Follow-up:** Same pattern for `tests/tty/index.test.ts`?

**User selection:** Yes — `tests/tty/index.test.ts` also runs main + worker adapters.

**Note:** Browser has no worker adapter — `tests/browser/index.test.ts` = single adapter.

**Captured as D-03 and D-04.**

---

### 4. rstest.config.ts globs

**Question asked:** How should `rstest.config.ts` evolve to cover `tests/console/`?

**Options presented:**
1. Add `tests/console/**/*.test.ts` to `node-console` project include *(recommended)*
2. Replace `tests/node/**` with `tests/console/**`
3. Create a separate rstest project for console

**User selection:** Add `tests/console/**` to node-console (keeps `tests/node/**` for
remaining non-shared tests).

**Captured as D-06.**

---

## Summary of Decisions

| ID | Decision |
|----|----------|
| D-01 | Delete 7 standalone node tests (formats, levels, mixins, options, prefix, scopes, spinner-node) |
| D-02 | Delete parity-console.test.ts, parity-tty.test.ts, parity.suite.ts |
| D-03 | tests/console/{format}/index.test.ts runs main + worker adapters |
| D-04 | tests/tty/index.test.ts runs ttyAdapter + ttyWorkerAdapter; browser = main adapter only |
| D-05 | Non-shared preservation list: worker-protocol, registry, worker-e2e, console.test.ts (node/main/); spinner-tty.test.ts, env.ts (tty/); browser.test.ts (browser/main/) |
| D-06 | node-console project include: add tests/console/**/*.test.ts |

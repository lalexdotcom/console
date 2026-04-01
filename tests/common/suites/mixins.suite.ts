import { expect } from '@rstest/core';
import { L } from '../../../src';
import type { LogOutput } from '../output';
import type { Suite } from './suite';

/**
 * Declarative suite covering once(), limit(n), limit(n, key), and options({...})
 * rate-limiting mixins (MIX-01 through MIX-04).
 */
export const mixinsSuite: Suite = {
  name: 'mixins',
  description:
    'Rate-limiting mixins: once, limit, and one-shot options (MIX-01/02/03/04)',
  tests: [
    // MIX-01: once() emits exactly once regardless of call count
    {
      name: 'once() called in a loop emits exactly once regardless of call count',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-once-loop');
        for (let i = 0; i < 5; i++) {
          s.once().info('msg'); // same source line → same call-site key every iteration
        }
      },
      check(entries: LogOutput[]) {
        // All 5 iterations share the same call-site key (same file:line).
        // Only the first iteration emits; the rest are silently dropped.
        expect(entries).toHaveLength(1);
      },
    },
    // MIX-02: limit(n) emits exactly n times
    {
      name: 'limit(3) called 10 times emits exactly 3 times',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-limit-basic');
        for (let i = 0; i < 10; i++) {
          s.limit(3).info('msg'); // same source line → same call-site key every iteration
        }
      },
      check(entries: LogOutput[]) {
        // Counter max is 3: iterations 0-2 emit, iterations 3-9 are dropped.
        expect(entries).toHaveLength(3);
      },
    },
    // MIX-03: limit(n, key) — explicit key groups calls across source lines
    {
      name: 'explicit key groups calls from different lines under one shared counter',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('mix-limit-key');
        const key = 'shared-counter';
        // The explicit key bypasses call-site derivation — all three share one counter.
        // Max=2: first two emit, third is dropped.
        s.limit(2, key).info('first');
        s.limit(2, key).info('second');
        s.limit(2, key).info('third'); // counter at max → dropped
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(2);
      },
    },
    // MIX-04: options({...}) provides a one-shot options override without mutating scope state
    {
      name: 'options({date:true}).info() adds date bracket; next s.info() reverts to no date',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('mix-options-oneshot');
        // One-shot override: passes options as an EmitOptions.options layer — no mutation to state.
        s.options({ date: true }).info('timed');
        s.info('plain');
      },
      check(entries: LogOutput[]) {
        // First entry had date=true override → date bracket in raw
        expect(entries[0].raw).toMatch(/\[\d{4}-\d{2}-\d{2}/);
        // Second entry uses un-mutated scope state — date reverts to default (false)
        expect(entries[1].raw).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
  ],
};

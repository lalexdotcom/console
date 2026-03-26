import { beforeEach, describe, expect, test } from '@rstest/core';
import { L } from '../../src';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering once(), limit(n), limit(n, key), and options({...})
 * rate-limiting mixins (MIX-01 through MIX-04).
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`mixins (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
    });

    // MIX-01: once() emits exactly once regardless of call count
    describe('once() (MIX-01)', () => {
      test('once() called in a loop emits exactly once regardless of call count', async () => {
        L.format = 'json';
        const s = L.scope('mix-once-loop');
        const lines = await adapter.capture(() => {
          for (let i = 0; i < 5; i++) {
            s.once().info('msg'); // same source line → same call-site key every iteration
          }
        });
        // All 5 iterations share the same call-site key (same file:line).
        // Only the first iteration emits; the rest are silently dropped.
        expect(lines).toHaveLength(1);
      });
    });

    // MIX-02: limit(n) emits exactly n times
    describe('limit(n) (MIX-02)', () => {
      test('limit(3) called 10 times emits exactly 3 times', async () => {
        L.format = 'json';
        const s = L.scope('mix-limit-basic');
        const lines = await adapter.capture(() => {
          for (let i = 0; i < 10; i++) {
            s.limit(3).info('msg'); // same source line → same call-site key every iteration
          }
        });
        // Counter max is 3: iterations 0-2 emit, iterations 3-9 are dropped.
        expect(lines).toHaveLength(3);
      });
    });

    // MIX-03: limit(n, key) — explicit key groups calls across source lines
    describe('limit(n, key) (MIX-03)', () => {
      test('explicit key groups calls from different lines under one shared counter', async () => {
        L.format = 'json';
        const s = L.scope('mix-limit-key');
        const key = 'shared-counter';
        // Three separate captures simulate calls from physically different source lines.
        // The explicit key bypasses call-site derivation — all three share one counter.
        const out1 = await adapter.capture(() => { s.limit(2, key).info('first'); });
        const out2 = await adapter.capture(() => { s.limit(2, key).info('second'); });
        const out3 = await adapter.capture(() => { s.limit(2, key).info('third'); });
        expect(out1).toHaveLength(1); // counter=1, below max=2 → emits
        expect(out2).toHaveLength(1); // counter=2, at max=2 → emits
        expect(out3).toHaveLength(0); // counter=3, above max=2 → dropped
      });
    });

    // MIX-04: options({...}) provides a one-shot options override without mutating scope state
    describe('options({...}) (MIX-04)', () => {
      test('options({date:true}).info() adds date bracket; next s.info() reverts to no date', async () => {
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('mix-options-oneshot');
        // One-shot override: passes options as an EmitOptions.options layer — no mutation to state.
        const withDate = await adapter.capture(() => { s.options({ date: true }).info('timed'); });
        const noDate = await adapter.capture(() => { s.info('plain'); });
        // First call had date=true override → date bracket appears in prefix
        expect(withDate[0]).toMatch(/\[\d{4}-\d{2}-\d{2}/);
        // Second call uses un-mutated scope state — date reverts to default (false)
        expect(noDate[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      });
    });
  });
}

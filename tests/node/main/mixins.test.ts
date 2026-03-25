import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles.
// beforeEach: registry.scopes is cleared → each test receives a fresh scope with
// its own LimitMixin entries Map, so all rate-limit counters start at 0.
// D-09: use L.scope('unique-per-test-name') for every mixin test to guarantee isolation.

describe('once() (MIX-01)', () => {
  test('once() called in a loop emits exactly once regardless of call count', () => {
    L.format = 'json';
    const s = L.scope('mix-once-loop');
    const { stdout } = captureAll(() => {
      for (let i = 0; i < 5; i++) {
        s.once().info('msg'); // same source line → same call-site key every iteration
      }
    });
    // All 5 iterations share the same call-site key (same file:line).
    // Only the first iteration emits; the rest are silently dropped.
    expect(stdout).toHaveLength(1);
  });
});

describe('limit(n) (MIX-02)', () => {
  test('limit(3) called 10 times emits exactly 3 times', () => {
    L.format = 'json';
    const s = L.scope('mix-limit-basic');
    const { stdout } = captureAll(() => {
      for (let i = 0; i < 10; i++) {
        s.limit(3).info('msg'); // same source line → same call-site key every iteration
      }
    });
    // Counter max is 3: iterations 0-2 emit, iterations 3-9 are dropped.
    expect(stdout).toHaveLength(3);
  });
});

describe('limit(n, key) (MIX-03)', () => {
  test('explicit key groups calls from different lines under one shared counter', () => {
    L.format = 'json';
    const s = L.scope('mix-limit-key');
    const key = 'shared-counter';
    // Three calls from physically different source lines.
    // The explicit key bypasses call-site derivation — all three share one counter.
    const { stdout: out1 } = captureAll(() => s.limit(2, key).info('first'));
    const { stdout: out2 } = captureAll(() => s.limit(2, key).info('second'));
    const { stdout: out3 } = captureAll(() => s.limit(2, key).info('third'));
    // Counter max is 2: first two calls emit; third call finds count>=max and is dropped.
    expect(out1).toHaveLength(1);
    expect(out2).toHaveLength(1);
    expect(out3).toHaveLength(0);
  });
});

describe('options({...}) (MIX-04)', () => {
  test('options({date:true}).info() adds date bracket; next s.info() reverts to no date', () => {
    L.format = 'pretty';
    L.pad = false;
    const s = L.scope('mix-options-oneshot');
    // One-shot override: passes options as an EmitOptions.options layer — no mutation to state.
    const { stdout: withDate } = captureAll(() => s.options({ date: true }).info('timed'));
    const { stdout: noDate } = captureAll(() => s.info('plain'));
    // First call had date=true override → date bracket appears in prefix
    expect(withDate[0]).toMatch(/\[\d{4}-\d{2}-\d{2}/);
    // Second call uses un-mutated scope state — date reverts to default (false)
    expect(noDate[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
  });
});

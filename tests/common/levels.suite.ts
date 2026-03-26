import { beforeEach, describe, expect, test } from '@rstest/core';
import { L, LogLevels } from '../../src';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering level dispatch, filtering, and toggle (CORE-01/02/03).
 * Receives a TestAdapter — has no concrete adapter dependency.
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`levels (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
      // Force JSON format so TRACE_LEVELS (emerg/alert/crit/error/warn) never emit a
      // separate stack-trace line to stdout. The format is also ignored by browser tests
      // (browser always uses %c CSS), so this guard only affects node adapters.
      L.format = 'json';
    });

    // CORE-01: each level emits exactly one output line regardless of which stream it uses
    describe('Level dispatch (CORE-01)', () => {
      test.each(LogLevels)('%s emits exactly one line', async (level) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('msg');
        });
        expect(lines).toHaveLength(1);
      });
    });

    // CORE-02: threshold-based filtering
    describe('Level filtering (CORE-02)', () => {
      test('messages below configured threshold are suppressed', async () => {
        // warn = severity 4; info = severity 7 → info is below threshold → suppressed
        L.level = 'warn';
        const lines = await adapter.capture(() => L.info('suppressed'));
        expect(lines).toHaveLength(0);
      });

      test('messages at the configured level pass through', async () => {
        L.level = 'warn';
        const lines = await adapter.capture(() => L.warn('at threshold'));
        expect(lines).toHaveLength(1);
      });

      test('messages more critical than the threshold pass through', async () => {
        // error = severity 3, below warn(4) — more critical → passes
        L.level = 'warn';
        const lines = await adapter.capture(() => L.error('more critical'));
        expect(lines).toHaveLength(1);
      });

      test('default level (wth) allows all 11 levels through', async () => {
        for (const level of ['emerg', 'info', 'wth'] as const) {
          const lines = await adapter.capture(() =>
            (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x'),
          );
          expect(lines).toHaveLength(1);
        }
      });
    });

    // CORE-03: enabled flag toggle
    describe('Logger.enabled toggle (CORE-03)', () => {
      test('enabled=false suppresses all output', async () => {
        L.enabled = false;
        const lines = await adapter.capture(() => {
          L.info('suppressed');
          L.error('also suppressed');
        });
        expect(lines).toHaveLength(0);
      });

      test('enabled=false also suppresses scoped loggers', async () => {
        L.enabled = false;
        const s = L.scope('enabled-test');
        const lines = await adapter.capture(() => s.info('suppressed'));
        expect(lines).toHaveLength(0);
      });

      test('re-enabling allows output again', async () => {
        L.enabled = false;
        L.enabled = true;
        const lines = await adapter.capture(() => L.info('visible'));
        expect(lines).toHaveLength(1);
      });
    });
  });
}

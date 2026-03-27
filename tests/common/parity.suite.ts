import { beforeEach, describe, expect, test } from '@rstest/core';
import type { TestAdapter } from './adapter';

/**
 * Normalise volatile output fields before equality comparison.
 * Applied to both main and worker lines to make the comparison stable.
 *
 * Strips:
 * - ISO timestamps:   "2026-03-26T12:34:56.789Z" → "<ts>"
 * - Caller paths:     "(file.ts:28:21)"            → "(<caller>)"
 * - ANSI escapes:     "\x1b[32m"                   → "" (needed for TTY parity)
 * - Stack trace lines: "    at /path/file.ts:50:47" → removed entirely
 *   (trace-level calls like error/warn emit a stack trace whose line numbers differ
 *    between main and worker captures since the calls are on different source lines)
 */
function normalise(lines: string[]): string[] {
  return lines
    .filter(l => !/^\s+at\s+/.test(l))
    .map(l =>
      l
        .replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, '<ts>')
        .replace(/\([^)]+:\d+:\d+\)/g, '(<caller>)')
        .replace(/\x1b\[[0-9;]*m/g, ''),
    );
}

/**
 * Shared parity suite: asserts that main adapter and worker adapter produce
 * byte-identical output after normalisation for 5 representative log calls.
 *
 * Both adapters' setup() is called in beforeEach. Each test captures from
 * main and worker independently (sequential), then compares normalised arrays.
 *
 * @param mainAdapter   - Main logger adapter (e.g. node-console or node-tty)
 * @param workerAdapter - Worker logger adapter (console-worker or tty-worker)
 */
export function makeParitySuite(
  mainAdapter: TestAdapter,
  workerAdapter: TestAdapter,
): void {
  describe(`parity: ${mainAdapter.name} ↔ ${workerAdapter.name}`, () => {
    beforeEach(async () => {
      await mainAdapter.setup();
      await workerAdapter.setup();
    });

    test('info output is byte-identical after normalisation', async () => {
      const mainLines   = await mainAdapter.capture(() => mainAdapter.logger.info('parity test'));
      const workerLines = await workerAdapter.capture(() => workerAdapter.logger.info('parity test'));
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });

    test('error output is byte-identical after normalisation', async () => {
      const mainLines   = await mainAdapter.capture(() => mainAdapter.logger.error('parity test'));
      const workerLines = await workerAdapter.capture(() => workerAdapter.logger.error('parity test'));
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });

    test('warn output is byte-identical after normalisation', async () => {
      const mainLines   = await mainAdapter.capture(() => mainAdapter.logger.warn('parity test'));
      const workerLines = await workerAdapter.capture(() => workerAdapter.logger.warn('parity test'));
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });

    test('debug output is byte-identical after normalisation', async () => {
      const mainLines   = await mainAdapter.capture(() => mainAdapter.logger.debug('parity test'));
      const workerLines = await workerAdapter.capture(() => workerAdapter.logger.debug('parity test'));
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });

    test('scoped logger output is byte-identical after normalisation', async () => {
      const mainLines   = await mainAdapter.capture(() =>
        mainAdapter.logger.scope('parity-scope').info('scoped message'),
      );
      const workerLines = await workerAdapter.capture(() =>
        workerAdapter.logger.scope('parity-scope').info('scoped message'),
      );
      expect(normalise(mainLines)).toEqual(normalise(workerLines));
    });
  });
}

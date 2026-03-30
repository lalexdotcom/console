import { rs } from '@rstest/core';
import { L } from '../../src';
import type { RootLogger } from '../../src/types';
import type { TestAdapter } from '../common/adapter';

/**
 * Browser TestAdapter: intercepts all console methods using rs.spyOn.
 * Collects the first argument of each spy call (the %c format string or message string).
 * Stack trace entries (lines starting with whitespace + 'at ') are filtered out so
 * TRACE_LEVELS produce exactly one captured line per emit.
 *
 * rs.spyOn is the only available interception mechanism in browser tests — there is
 * no process.stdout in the browser environment (confirmed by existing browser.test.ts).
 */
export const browserAdapter: TestAdapter = {
  name: 'browser-main',
  setup() {
    // L.format is not meaningful in browser (output is always CSS %c).
    // reset.helper.ts handles registry reset globally via setupFiles.
  },
  async capture(fn: () => void | Promise<void>): Promise<string[]> {
    const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
    const groupSpy = rs
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});

    try {
      await fn();
      return [
        ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
      ].filter((l) => l.length > 0 && !/^\s+at /.test(l));
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
      groupSpy.mockRestore();
    }
  },
  get logger(): RootLogger {
    return L;
  },
};

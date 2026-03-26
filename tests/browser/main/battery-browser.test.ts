import { rs } from '@rstest/core';
import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';
import { makeSuite as makeLevelsSuite }   from '../../common/levels.suite';
import { makeSuite as makeMixinsSuite }   from '../../common/mixins.suite';
import { makeSuite as makeOptionsSuite }  from '../../common/options.suite';
import { makeSuite as makePrefixSuite }   from '../../common/prefix.suite';
import { makeSuite as makeScopesSuite }   from '../../common/scopes.suite';
import { makeSuite as makeSpinnersSuite } from '../../common/spinners.suite';

// formats.suite excluded: browser output is always CSS %c format strings.
// CORE-04/05/06 tests call JSON.parse() and parseLogfmt() on captured lines,
// which would throw because lines[0] is a '%c...' string, not JSON or logfmt text.

/**
 * Browser adapter: intercepts all console methods using rs.spyOn.
 * Collects the first argument of each call (the %c format string or message string).
 *
 * rstest browser tests run INSIDE the browser page — there is NO `page` object.
 * rs.spyOn is the only available interception mechanism (confirmed by browser.test.ts).
 *
 * Level routing in browser:
 * - TRACE_LEVELS (emerg/alert/crit/error/warn): console.groupCollapsed
 * - Other levels (notice/success/info/verb/debug/wth): console.log
 * - Spinners: console.log (regardless of level)
 */
const browserAdapter: TestAdapter = {
  name: 'browser-main',
  setup() {
    // L.format is not meaningful in browser (output is always CSS %c).
    // reset.helper.ts handles registry reset globally via setupFiles.
  },
  async capture(fn: () => void | Promise<void>): Promise<string[]> {
    const logSpy   = rs.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy  = rs.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
    const groupSpy = rs.spyOn(console, 'groupCollapsed').mockImplementation(() => {});

    try {
      await fn();
      // Collect the first argument of each spy call as a string line.
      // TRACE_LEVELS produce groupCollapsed calls (the formatted message) plus a
      // console.log call with the stack trace content ('    at http://...'). Filter
      // out stack trace entries so TRACE_LEVELS count as exactly one captured line.
      const lines: string[] = [
        ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
      ].filter(l => l.length > 0 && !/^\s+at /.test(l));
      return lines;
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

// Run 6 of 7 suites with the browser adapter (formats suite excluded).
makeLevelsSuite(browserAdapter);
makeScopesSuite(browserAdapter);
makeOptionsSuite(browserAdapter);
makePrefixSuite(browserAdapter);
makeMixinsSuite(browserAdapter);
makeSpinnersSuite(browserAdapter);

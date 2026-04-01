import { rs } from '@rstest/core';
import { L } from '../../src';
import type { TestAdapter } from '../common/adapter';
import type { LogOutput } from '../common/output';

const BADGE_TO_LEVEL: Record<string, string> = {
  EMERGENCY: 'emerg',
  ALERT: 'alert',
  CRITICAL: 'crit',
  ERROR: 'error',
  WARNING: 'warn',
  NOTICE: 'notice',
  SUCCESS: 'success',
  INFO: 'info',
  VERBOSE: 'verb',
  DEBUG: 'debug',
  'WHO CARES?': 'wth',
};

/**
 * Parses one browser %c format-string line into a LogOutput.
 * c[0] is the format string: "%c[INFO]%c hello" or "%c-%c" (running spinner).
 * Returns null for empty or whitespace-only lines and for stack trace entries.
 *
 * Two badge formats are handled:
 *   - with brackets (color=false):  "[   INFO    <scope>]  - msg"
 *   - without brackets (color=true): "   INFO    <scope>  - msg" (after %c strip)
 */
function parseBrowserLine(line: string): LogOutput | null {
  if (!line || line.trim().length === 0) return null;
  // Stack trace lines start with optional whitespace + 'at '
  if (/^\s*at /.test(line)) return null;

  // Strip %c markers to get readable text
  const text = line.replace(/%c/g, '').trim();
  if (text.length === 0) return null;

  // Badge with brackets: [BADGE] or [BADGE <scope>], followed by optional spinner icon
  const bracketBadgeMatch = text.match(/^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/);
  if (bracketBadgeMatch) {
    const remainder = bracketBadgeMatch[3].trim();
    const bareIconMatch = remainder.match(/^([✔✖\-])\s*(.*)/);
    if (bareIconMatch && bareIconMatch[1].length <= 2) {
      const icon = bareIconMatch[1];
      const spinnerState: LogOutput['spinnerState'] =
        icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
      return { raw: line, icon, spinnerState, scope: bracketBadgeMatch[2], msg: bareIconMatch[2].trim() };
    }
    return { raw: line, level: BADGE_TO_LEVEL[bracketBadgeMatch[1].trim()], scope: bracketBadgeMatch[2], msg: remainder };
  }

  // Badge WITHOUT brackets (color=true CSS format): "   BADGE   <scope>  [-/✔/✖] msg"
  // renderBrowserPrefix emits %cBADGE_TEXT%c (no brackets) when color=true.
  const noBracketBadgeMatch = text.match(/^\s*([A-Z][A-Z\s?]*)(?:\s*<([^>]+)>)?\s+(.*)/);
  if (noBracketBadgeMatch) {
    const badgeKey = noBracketBadgeMatch[1].trim();
    if (BADGE_TO_LEVEL[badgeKey] !== undefined) {
      const remainder = noBracketBadgeMatch[3].trim();
      const bareIconMatch = remainder.match(/^([✔✖\-])\s*(.*)/);
      if (bareIconMatch && bareIconMatch[1].length <= 2) {
        const icon = bareIconMatch[1];
        const spinnerState: LogOutput['spinnerState'] =
          icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
        return { raw: line, icon, spinnerState, scope: noBracketBadgeMatch[2], msg: bareIconMatch[2].trim() };
      }
      return { raw: line, level: BADGE_TO_LEVEL[badgeKey], scope: noBracketBadgeMatch[2], msg: remainder };
    }
  }

  // Standalone spinner icon (no leading badge): '-' (running), '✔' (success), '✖' (fail)
  const spinnerMatch = text.match(/^([✔✖\-])\s*(.*)/);
  if (spinnerMatch && spinnerMatch[1].length <= 2) {
    const icon = spinnerMatch[1];
    const spinnerState: LogOutput['spinnerState'] =
      icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
    return { raw: line, icon, spinnerState, msg: spinnerMatch[2].trim() };
  }

  return { raw: line };
}

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
  parse: parseBrowserLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
    const groupSpy = rs
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});

    try {
      await fn();
      const rawLines = [
        ...logSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...warnSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...errorSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...debugSpy.mock.calls.map((c: unknown[]) => String(c[0])),
        ...groupSpy.mock.calls.map((c: unknown[]) => String(c[0])),
      ].filter((l) => l.length > 0);
      return rawLines
        .map((line) => parseBrowserLine(line))
        .filter((e): e is LogOutput => e !== null);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
      groupSpy.mockRestore();
    }
  },
};

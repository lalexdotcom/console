import { L } from '../../../src';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import type { LogOutput } from '../../common/output';
import { captureAsync } from '../../common/capture.helper';

/** Strips ANSI colour escape sequences from a string. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Maps pretty-format badge text to the LogOutput level string. */
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
 * Parses one pretty-format output line into a LogOutput.
 * Returns null for stack trace lines and blank lines.
 */
function parsePrettyLine(line: string): LogOutput | null {
  const stripped = stripAnsi(line);
  if (stripped.trim().length === 0) return null;
  if (/^\s+at /.test(stripped)) return null;

  // Spinner icon bracket: [ ⋯ ] / [ ✔ ] / [ ✖ ] / [ - ]
  const iconMatch = stripped.match(/^\[\s*([^\[\]\s]{1,3})\s*\]\s*(.*)/);
  if (iconMatch) {
    const icon = iconMatch[1];
    const spinnerState: LogOutput['spinnerState'] =
      icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
    return { raw: line, icon, spinnerState, msg: iconMatch[2].trim() };
  }

  // Level badge: [BADGE] or [BADGE <scope>]
  const badgeMatch = stripped.match(
    /^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/,
  );
  if (badgeMatch) {
    return {
      raw: line,
      level: BADGE_TO_LEVEL[badgeMatch[1].trim()],
      scope: badgeMatch[2],
      msg: badgeMatch[3].trim(),
    };
  }

  return { raw: line };
}

/**
 * Main console adapter for pretty format.
 * setup() sets L.format = 'pretty' after global registry reset (reset.helper.ts handles reset).
 */
export const mainAdapter: TestAdapter = {
  name: 'node-console:pretty',
  setup() {
    L.format = 'pretty';
  },
  parse: parsePrettyLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => parsePrettyLine(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

/**
 * Worker console adapter for pretty format.
 * setup() calls releaseWorker() first to kill the fork and activate WL→L fallback,
 * then sets WL.format. Order is critical: setting WL.format before releaseWorker() sends
 * an IPC opt:format message to the fork, invisible to captureAsync on the main thread.
 */
export const workerAdapter: TestAdapter = {
  name: 'node-console-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback active: directly sets L.format on main thread
  },
  parse: parsePrettyLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => parsePrettyLine(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

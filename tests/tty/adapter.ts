import { L } from '../../src';
import { releaseWorker, Logger as WL } from '../../src/worker/index';
import type { TestAdapter } from '../common/adapter';
import type { LogOutput } from '../common/output';
import { captureAsync } from '../common/capture.helper';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

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
 * Parses one TTY pretty-format line (with ANSI escapes) into a LogOutput.
 * Returns null for blank lines and stack trace lines.
 */
function parsePrettyLine(line: string): LogOutput | null {
  const stripped = stripAnsi(line);
  if (stripped.trim().length === 0) return null;
  if (/^\s+at /.test(stripped)) return null;

  // Spinner icon bracket: [ ⋯ ] / [ ✔ ] / [ ✖ ]
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
 * Node-TTY main adapter — real TTY routing active via resolve.alias in rstest.config.ts.
 * The node-tty project bundles tests/tty/env.ts as src/utils/env, making isNodeTTY=true
 * a compile-time constant. Only 3 suites are run — those compatible with ANSI-prefixed
 * TTY output (no JSON.parse calls, no console-mode spinner assumptions).
 */
export const ttyAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() {
    // Force pretty format — TTY mode renders ANSI-prefixed human-readable output.
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
 * Node-TTY worker adapter — mirrors ttyAdapter but routes through WL after releaseWorker().
 * After releaseWorker(), WL routes to L on the main thread. With the resolve.alias active,
 * isNodeTTY=true — real TTY routing is in effect for both adapters.
 */
export const ttyWorkerAdapter: TestAdapter = {
  name: 'node-tty-worker:pretty',
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

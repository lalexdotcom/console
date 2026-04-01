import { L } from '../../src';
import { releaseWorker, Logger as WL } from '../../src/worker/index';
import type { TestAdapter } from '../common/adapter';
import { captureAsync } from '../common/capture.helper';
import { parseAnyLine } from '../common/helpers/parse-line';
import type { LogOutput } from '../common/output';

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
  parse: parseAnyLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => parseAnyLine(line))
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
  parse: parseAnyLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => parseAnyLine(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

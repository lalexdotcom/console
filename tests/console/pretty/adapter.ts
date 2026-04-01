import { L } from '../../../src';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { captureAsync } from '../../common/capture.helper';
import { parseAnyLine } from '../../common/helpers/parse-line';
import type { LogOutput } from '../../common/output';

/**
 * Main console adapter for pretty format.
 * setup() sets L.format = 'pretty' after global registry reset (reset.helper.ts handles reset).
 */
export const mainAdapter: TestAdapter = {
  name: 'node-console:pretty',
  setup() {
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
  parse: parseAnyLine,
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => parseAnyLine(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

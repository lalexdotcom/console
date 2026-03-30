import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { captureAsync } from '../../common/capture.helper';

// Type-level check: WL must satisfy RootLogger — compile error if API surface diverges.
const _typeCheck: RootLogger = WL as unknown as RootLogger;
void _typeCheck;

/**
 * Main console adapter for logfmt format.
 * setup() sets L.format = 'logfmt' after global registry reset (reset.helper.ts handles reset).
 */
export const mainAdapter: TestAdapter = {
  name: 'node-console:logfmt',
  setup() {
    L.format = 'logfmt';
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

/**
 * Worker console adapter for logfmt format.
 * setup() calls releaseWorker() first to kill the fork and activate WL→L fallback,
 * then sets WL.format. Order is critical: setting WL.format before releaseWorker() sends
 * an IPC opt:format message to the fork, invisible to captureAsync on the main thread.
 */
export const workerAdapter: TestAdapter = {
  name: 'node-console-worker:logfmt',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'logfmt'; // after fallback active: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};

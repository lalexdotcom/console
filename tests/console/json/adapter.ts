import { L } from '../../../src';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import type { LogOutput } from '../../common/output';
import { captureAsync } from '../../common/capture.helper';

/**
 * Main console adapter for json format.
 * setup() sets L.format = 'json' after global registry reset (reset.helper.ts handles reset).
 */
export const mainAdapter: TestAdapter = {
  name: 'node-console:json',
  setup() {
    L.format = 'json';
  },
  parse(line: string): LogOutput | null {
    try {
      const p = JSON.parse(line) as Record<string, unknown>;
      if (typeof p.severity !== 'string') return null;
      return {
        raw: line,
        level: p.severity,
        scope: typeof p.scope === 'string' ? p.scope : undefined,
        msg: typeof p.msg === 'string' ? p.msg : undefined,
        date: typeof p.time === 'string' ? p.time : undefined,
        caller: typeof p.caller === 'string' ? p.caller : undefined,
        progress: typeof p.progress === 'number' ? p.progress : undefined,
      };
    } catch {
      return null;
    }
  },
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => this.parse(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

/**
 * Worker console adapter for json format.
 * setup() calls releaseWorker() first to kill the fork and activate WL→L fallback,
 * then sets WL.format. Order is critical: setting WL.format before releaseWorker() sends
 * an IPC opt:format message to the fork, invisible to captureAsync on the main thread.
 */
export const workerAdapter: TestAdapter = {
  name: 'node-console-worker:json',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'json'; // after fallback active: directly sets L.format on main thread
  },
  parse(line: string): LogOutput | null {
    try {
      const p = JSON.parse(line) as Record<string, unknown>;
      if (typeof p.severity !== 'string') return null;
      return {
        raw: line,
        level: p.severity,
        scope: typeof p.scope === 'string' ? p.scope : undefined,
        msg: typeof p.msg === 'string' ? p.msg : undefined,
        date: typeof p.time === 'string' ? p.time : undefined,
        caller: typeof p.caller === 'string' ? p.caller : undefined,
        progress: typeof p.progress === 'number' ? p.progress : undefined,
      };
    } catch {
      return null;
    }
  },
  async capture(fn: () => void | Promise<void>): Promise<LogOutput[]> {
    const rawLines = await captureAsync(fn);
    return rawLines
      .map((line) => this.parse(line))
      .filter((e): e is LogOutput => e !== null);
  },
};

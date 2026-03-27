import { afterEach } from '@rstest/core';
import { L } from '../../../src';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';
import { makeParitySuite } from '../../common/parity.suite';

/**
 * Async-safe stream capture — inline copy, identical to parity-console.test.ts.
 * In the node-tty rstest project, isNodeTTY=true is a compile-time constant
 * (via resolve.alias wired in rstest.config.ts — Plan 10-01). Output includes
 * ANSI escape codes from renderTTYPrefix; the normalise() in parity.suite.ts
 * strips them before comparison.
 */
async function captureAsync(fn: () => void | Promise<void>): Promise<string[]> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const intercept = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return chunks.join('\n').split('\n').filter(l => l.trim().length > 0);
}

/**
 * Node-TTY parity adapter (main). L.format = 'pretty' is harmless in TTY mode —
 * emitTTY() calls process.stdout.write directly regardless of L.format.
 * This adapter sees isNodeTTY=true because the node-tty rstest project bundles
 * with the TTY alias active.
 */
const ttyAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() {
    L.format = 'pretty'; // harmless in TTY mode — emitTTY routes independently
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

/**
 * Node-TTY-worker parity adapter. Calls releaseWorker() to activate WL→L fallback.
 * After fallback, both main logger and worker logger route through the same emitTTY()
 * call path (isNodeTTY=true is compile-time), so their outputs are parity-comparable.
 */
const ttyWorkerAdapter: TestAdapter = {
  name: 'node-tty-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};

// Belt-and-suspenders fork cleanup — required to prevent fork leakage between tests.
afterEach(() => {
  releaseWorker();
});

makeParitySuite(ttyAdapter, ttyWorkerAdapter);

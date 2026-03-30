import { afterEach } from '@rstest/core';
import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { makeParitySuite } from '../../common/parity.suite';

/**
 * Async-safe stream capture — inline copy of the pattern used in all battery files.
 * Patches process.stdout.write + process.stderr.write, awaits fn(), then restores.
 * Returns captured output as normalised lines (split on \n, empty stripped).
 *
 * Worker adapter note: captures only AFTER releaseWorker() activates the WL→L fallback.
 */
async function captureAsync(fn: () => void | Promise<void>): Promise<string[]> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const intercept = (chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
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
  return chunks
    .join('\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

/**
 * Node-console parity adapter (main). Uses pretty format — chosen because pretty
 * output is what end-users see and is the most representative parity target.
 */
const nodeConsoleAdapter: TestAdapter = {
  name: 'node-console:pretty',
  setup() {
    L.format = 'pretty';
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

/**
 * Node-console-worker parity adapter. Calls releaseWorker() first to activate the
 * WL→L fallback, then sets WL.format (which sets L.format on main thread after fallback).
 * Order is critical — setting format before releaseWorker() sends IPC to the fork instead.
 */
const consoleWorkerAdapter: TestAdapter = {
  name: 'node-console-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};

// Belt-and-suspenders fork cleanup — mirrors battery-node-console-worker.test.ts.
afterEach(() => {
  releaseWorker();
});

makeParitySuite(nodeConsoleAdapter, consoleWorkerAdapter);

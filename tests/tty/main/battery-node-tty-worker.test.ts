import { afterEach } from '@rstest/core';
import type { RootLogger } from '../../../src/types';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { makeSuite as makeLevelsSuite }  from '../../common/levels.suite';
import { makeSuite as makeMixinsSuite }  from '../../common/mixins.suite';
import { makeSuite as makeOptionsSuite } from '../../common/options.suite';

// formats.suite excluded: mirrors battery-node-tty.test.ts (D-08).
// scopes/prefix suites excluded: call JSON.parse() — throws on ANSI TTY output.
// spinners.suite excluded: assumes console-mode timing; TTY spinner uses ttyRenderer.
// L is not imported directly: WL (via fallback) routes all calls through L after releaseWorker()

/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Worker adapter note: captures only AFTER releaseWorker() has activated the WL→L
 * fallback. Fork output is NOT capturable (inherited stdio, OS-level fd bypass).
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

  return chunks
    .join('\n')
    .split('\n')
    .filter(l => l.trim().length > 0);
}

/**
 * Node-TTY-worker TestAdapter — real TTY routing active via resolve.alias (Phase 10).
 *
 * Mirrors battery-node-tty.test.ts adapter: same suite set (3 suites, formats excluded),
 * same format ('pretty'). Demonstrates structural parity between main and worker
 * variants for the TTY environment (BATTERY-04, D-09).
 *
 * After releaseWorker(), WL routes through L on the main thread. With Phase 10
 * resolve.alias active, isNodeTTY=true — real TTY routing is in effect.
 */
const ttyWorkerAdapter: TestAdapter = {
  name: 'node-tty-worker:pretty',
  setup() {
    releaseWorker(); // kill fork, activate WL→L fallback
    WL.format = 'pretty'; // after fallback active: directly sets L.format on main thread
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return WL as unknown as RootLogger;
  },
};

// Belt-and-suspenders fork cleanup per D-05.
afterEach(() => {
  releaseWorker();
});

// 3 suites × 1 adapter — mirrors battery-node-tty.test.ts suite set exactly (D-08, D-09).
makeLevelsSuite(ttyWorkerAdapter);
makeOptionsSuite(ttyWorkerAdapter);
makeMixinsSuite(ttyWorkerAdapter);

import { afterEach } from '@rstest/core';
import type { RootLogger } from '../../../src/types';
import { Logger as WL, releaseWorker } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { makeSuite as makeLevelsSuite }   from '../../common/levels.suite';
import { makeSuite as makeMixinsSuite }   from '../../common/mixins.suite';
import { makeSuite as makeOptionsSuite }  from '../../common/options.suite';
import { makeSuite as makePrefixSuite }   from '../../common/prefix.suite';
import { makeSuite as makeScopesSuite }   from '../../common/scopes.suite';
import { makeSuite as makeSpinnersSuite } from '../../common/spinners.suite';
// formats.suite is intentionally excluded: mirrors battery-node-tty.test.ts (D-08)
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
 * Node-TTY-worker TestAdapter — single pretty-format variant.
 *
 * Mirrors battery-node-tty.test.ts adapter: same suite set (6 suites, formats excluded),
 * same format ('pretty'). Demonstrates structural parity between main and worker
 * variants for the TTY environment (BATTERY-04, D-09).
 *
 * After releaseWorker(), WL routes through L on the main thread. The Phase 09 TTY
 * bundle-time constraint (isNodeTTY = false) applies equally here — console mode
 * is in effect, which is consistent with battery-node-tty.test.ts.
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

// 6 suites × 1 adapter — mirrors battery-node-tty.test.ts suite set exactly (D-08, D-09).
makeLevelsSuite(ttyWorkerAdapter);
makeScopesSuite(ttyWorkerAdapter);
makeOptionsSuite(ttyWorkerAdapter);
makePrefixSuite(ttyWorkerAdapter);
makeMixinsSuite(ttyWorkerAdapter);
makeSpinnersSuite(ttyWorkerAdapter);

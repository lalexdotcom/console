import { afterEach } from '@rstest/core';
import type { RootLogger } from '../../../src/types';
import { releaseWorker, Logger as WL } from '../../../src/worker/index';
import type { TestAdapter } from '../../common/adapter';
import { formatsSuite } from '../../common/suites/formats.suite';
import { levelsSuite } from '../../common/suites/levels.suite';
import { mixinsSuite } from '../../common/suites/mixins.suite';
import { optionsSuite } from '../../common/suites/options.suite';
import { prefixSuite } from '../../common/suites/prefix.suite';
import { runSuite } from '../../common/suites/runner';
import { scopesSuite } from '../../common/suites/scopes.suite';
import { spinnersSuite } from '../../common/suites/spinners.suite';

// Type-level check: WL must satisfy RootLogger — compile error if API surface diverges.
const _typeCheck: RootLogger = WL as unknown as RootLogger;
void _typeCheck;

/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Worker adapter note: this function captures output only AFTER releaseWorker() has
 * activated the WL→L fallback. Fork output (written to inherited fd 1) is NOT captured
 * — it bypasses the JS-level write patch. See RESEARCH.md §Critical Finding 2.
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
 * Creates a node-console-worker TestAdapter for the given format.
 *
 * Strategy: call releaseWorker() FIRST to kill the fork and activate the WL→L
 * fallback, then set WL.format. Order is critical — setting WL.format before
 * releaseWorker() sends an IPC opt:format message to the fork (which sets the format
 * in the child process, invisible to captureAsync on the main thread).
 *
 * After releaseWorker(), WL ≡ L: all WL calls route to L on the main process, which
 * captureAsync can capture normally. This demonstrates structural API parity (BATTERY-04).
 *
 * releaseWorker() is idempotent — safe to call in every beforeEach.
 */
function makeConsoleWorkerAdapter(
  format: 'json' | 'logfmt' | 'pretty',
): TestAdapter {
  return {
    name: `node-console-worker:${format}`,
    setup() {
      releaseWorker(); // kill fork, activate WL→L fallback
      WL.format = format; // after fallback active: directly sets L.format on main thread
    },
    capture: captureAsync,
    get logger(): RootLogger {
      return WL as unknown as RootLogger;
    },
  };
}

// Belt-and-suspenders fork cleanup per D-05.
// releaseWorker() is already called in each adapter's setup() (beforeEach) — this
// afterEach ensures cleanup even on unexpected test failures or timing edge cases.
// Idempotent: no-op if fallback is already active.
afterEach(() => {
  releaseWorker();
});

// Run all 7 suites with each of 3 format adapters → 21 suite group instantiations.
// Mirrors battery-node-console.test.ts structure exactly (D-06, D-09 parity).
const adapters = (['json', 'logfmt', 'pretty'] as const).map(
  makeConsoleWorkerAdapter,
);

for (const adapter of adapters) {
  runSuite(levelsSuite, adapter);
  runSuite(formatsSuite, adapter);
  runSuite(scopesSuite, adapter);
  runSuite(optionsSuite, adapter);
  runSuite(prefixSuite, adapter);
  runSuite(mixinsSuite, adapter);
  runSuite(spinnersSuite, adapter);
}

import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';
import { makeSuite as makeFormatsSuite }  from '../../common/formats.suite';
import { makeSuite as makeLevelsSuite }   from '../../common/levels.suite';
import { makeSuite as makeMixinsSuite }   from '../../common/mixins.suite';
import { makeSuite as makeOptionsSuite }  from '../../common/options.suite';
import { makeSuite as makePrefixSuite }   from '../../common/prefix.suite';
import { makeSuite as makeScopesSuite }   from '../../common/scopes.suite';
import { makeSuite as makeSpinnersSuite } from '../../common/spinners.suite';

/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Replaces the synchronous captureAll() for battery use: needed because
 * spinners.suite exec() tests await an async fn (SPIN-04).
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
 * Creates a node-console TestAdapter for the given format.
 * adapter.setup() sets L.format to the specified value (after global reset).
 * adapter.capture() uses the async stream interceptor above.
 */
function makeNodeConsoleAdapter(format: 'json' | 'logfmt' | 'pretty'): TestAdapter {
  return {
    name: `node-console:${format}`,
    setup() {
      L.format = format;
    },
    capture: captureAsync,
    get logger(): RootLogger {
      return L;
    },
  };
}

// Run all 7 suites with each of 3 format adapters → 21 suite group instantiations.
// formats.suite sets L.format per-test, so running it with all 3 adapters is harmless.
const adapters = (['json', 'logfmt', 'pretty'] as const).map(makeNodeConsoleAdapter);

for (const adapter of adapters) {
  makeLevelsSuite(adapter);
  makeFormatsSuite(adapter);
  makeScopesSuite(adapter);
  makeOptionsSuite(adapter);
  makePrefixSuite(adapter);
  makeMixinsSuite(adapter);
  makeSpinnersSuite(adapter);
}

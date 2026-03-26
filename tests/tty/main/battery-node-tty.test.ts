import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';
import { makeSuite as makeLevelsSuite }   from '../../common/levels.suite';
import { makeSuite as makeScopesSuite }   from '../../common/scopes.suite';
import { makeSuite as makeOptionsSuite }  from '../../common/options.suite';
import { makeSuite as makePrefixSuite }   from '../../common/prefix.suite';
import { makeSuite as makeMixinsSuite }   from '../../common/mixins.suite';
import { makeSuite as makeSpinnersSuite } from '../../common/spinners.suite';
// formats.suite is intentionally excluded: TTY mode never produces raw json/logfmt (D-07)

/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Phase 09 note: isNodeTTY is a bundle-time const (false); this adapter runs the logger
 * in console mode with L.format = 'pretty'. No ANSI stripping needed — console mode
 * (renderConsolePrefix) emits no ANSI escape sequences in prefix output.
 * Phase 10 will activate real TTY routing via rspack source.alias.
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
 * Node-TTY battery adapter — Phase 09 console-mode simulation.
 *
 * Phase 09 constraint: isNodeTTY is a rspack bundle-time const compiled to false in
 * the test bundle. There is no module namespace object to mutate. Direct assignment
 * (envModule.isNodeTTY = true) silently fails. Phase 10 wires a rspack source.alias
 * that swaps src/utils/env → tests/tty/env.ts at the bundler level, at which point
 * this adapter will activate real TTY routing.
 *
 * For Phase 09 the adapter forces L.format = 'pretty', which is what TTY mode would
 * produce. The shared suites that are compatible with console-mode pretty output run
 * unchanged (levels, scopes, options, prefix, mixins, spinners).
 */
const nodeTtyAdapter: TestAdapter = {
  name: 'node-tty:pretty',
  setup() {
    // Force pretty format — TTY mode renders ANSI-prefixed human-readable output.
    // The levels suite overrides L.format = 'json' in its own beforeEach, which is fine.
    L.format = 'pretty';
  },
  capture: captureAsync,
  get logger(): RootLogger {
    return L;
  },
};

// 6 suites × 1 adapter — formats suite excluded: TTY mode never renders json/logfmt (D-07).
makeLevelsSuite(nodeTtyAdapter);
makeScopesSuite(nodeTtyAdapter);
makeOptionsSuite(nodeTtyAdapter);
makePrefixSuite(nodeTtyAdapter);
makeMixinsSuite(nodeTtyAdapter);
makeSpinnersSuite(nodeTtyAdapter);

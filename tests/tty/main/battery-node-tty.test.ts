import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import type { TestAdapter } from '../../common/adapter';
import { runSuite } from '../../common/suites/runner';
import { levelsSuite } from '../../common/suites/levels.suite';
import { mixinsSuite } from '../../common/suites/mixins.suite';
import { optionsSuite } from '../../common/suites/options.suite';

// formats.suite excluded: TTY mode never produces raw json/logfmt.
// scopes/prefix suites excluded: call JSON.parse() — throws on ANSI-prefixed output.
// spinners.suite excluded: assumes console-mode timing; TTY spinner uses ttyRenderer.
// TTY spinner coverage in: tests/tty/main/spinner-tty.test.ts

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
 * Node-TTY battery adapter — real TTY routing active via resolve.alias (Phase 10).
 *
 * The node-tty rstest project bundles with isNodeTTY=true (resolve.alias in
 * rstest.config.ts substitutes src/utils/env → tests/tty/env.ts at bundle time).
 * emitTTY() writes ANSI-prefixed lines to process.stdout.write directly — all calls
 * route through TTY rendering regardless of L.format.
 *
 * Suites limited to those compatible with ANSI-prefixed output (no JSON.parse calls):
 * levels (toHaveLength), options (property checks), mixins (date-bracket regex).
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

// 3 suites × 1 adapter — limited to suites compatible with ANSI-prefixed TTY output.
runSuite(levelsSuite, nodeTtyAdapter);
runSuite(optionsSuite, nodeTtyAdapter);
runSuite(mixinsSuite, nodeTtyAdapter);

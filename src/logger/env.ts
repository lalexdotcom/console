import { env as processEnv } from 'node:process';
import type { inspect } from 'node:util';

/** True when running inside a Node.js process. */
export const isNode =
  typeof process !== 'undefined' &&
  process?.versions != null &&
  process?.versions?.node != null;

/** True when running inside a browser context. */
export const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';

/**
 * `util.inspect` loaded lazily via a deliberately obfuscated `require()` so
 * static bundler analysis (Webpack, Rspack…) does not try to bundle the
 * Node built-in or emit a "critical dependency" warning.
 * `undefined` when running in a browser.
 */
export const utilInspect: typeof inspect | undefined = (() => {
  if (!isNode) return undefined;
  try {
    return require(`${'util'}`)?.inspect;
  } catch {
    return undefined;
  }
})();

/**
 * The console object captured at module load time, before any patching.
 * Used by `RootLogger.unpatch()` to restore the original methods.
 */
export const systemConsole = console;

/**
 * Process environment variables. Empty object in browser contexts.
 */
export const env: Record<string, string | undefined> = isNode ? processEnv : {};

/**
 * True when running in TTY mode (interactive terminal, colors supported).
 * False when piped, redirected, or forced via `LLOGER_FORCE_CONSOLE=true`.
 */
export const isNodeTTY =
  isNode &&
  processEnv.LLOGER_FORCE_CONSOLE !== 'true' &&
  !!process.stdout?.isTTY;

/**
 * True when running in non-TTY console mode (pipe, CI, or forced via env var).
 * Use this to disable ANSI colors and other TTY-specific formatting.
 */
export const isNodeConsole = isNode && !isNodeTTY;

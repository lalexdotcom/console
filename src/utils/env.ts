import { env as processEnv } from 'node:process';
import type { inspect } from 'node:util';

/** True when running inside a Node.js process. */
export const isNode =
  typeof process !== 'undefined' &&
  process?.versions != null &&
  process?.versions?.node != null;

/** True when running inside a browser main thread (has `window.document`). */
export const isMainBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';

/** True when running inside a Web Worker (Dedicated, Shared, or Service Worker). */
export const isWebWorker =
  !isNode && typeof window === 'undefined' && typeof self !== 'undefined';

/** True when running in any browser context: main thread or Web Worker. */
export const isBrowser = isMainBrowser || isWebWorker;

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

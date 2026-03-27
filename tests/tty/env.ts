import type { inspect } from 'node:util';

// Alias target for resolve.alias in the node-tty rstest project (wired in Phase 10).
// Exports isNodeTTY=true and isNodeConsole=false as compile-time constants.
// All other exports from src/utils/env are duplicated directly here — NOT via
// `export * from '../../src/utils/env'` — because that path is itself aliased back to
// this file, creating a circular module reference that causes all exports to be undefined.

const processEnv = typeof process !== 'undefined' ? (process.env ?? {}) : {} as Record<string, string | undefined>;

export const isNode =
  typeof process !== 'undefined' &&
  process?.versions != null &&
  process?.versions?.node != null;

export const isMainBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';

export const isWebWorker =
  !isNode && typeof window === 'undefined' && typeof self !== 'undefined';

export const isBrowser = isMainBrowser || isWebWorker;

export const utilInspect: typeof inspect | undefined = (() => {
  if (!isNode) return undefined;
  try {
    return require(`${'util'}`)?.inspect;
  } catch {
    return undefined;
  }
})();

export const env: Record<string, string | undefined> = isNode ? processEnv : {};

// Compile-time TTY constants — these override the runtime detection in src/utils/env.
export const isNodeTTY = true;
export const isNodeConsole = false;

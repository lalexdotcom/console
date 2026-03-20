import type { LoggerOptions } from '../types';

// Re-export all public types so internal files that import from './types'
// (relative to src/logger/) continue to work without path changes.
export * from '../types';

/** Internal per-logger state — not part of the public API. */
export type LoggerState = {
  /** Explicitly configured options — undefined means "not set, cascade to parent". */
  options: Partial<LoggerOptions>;
  /** Defined only for scope loggers. */
  scope?: string;
};

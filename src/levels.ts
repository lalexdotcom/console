/**
 * Core log level definitions — shared between the logger and the worker proxy.
 * No dependencies on logger internals or Node/browser APIs.
 */

/**
 * Numeric severity for each level. Lower = more critical.
 * Used for level-filtering comparisons.
 */
export const LEVEL_METHODS = {
  emerg: 0,
  alert: 1,
  crit: 2,
  error: 3,
  warn: 4,
  notice: 5,
  success: 6,
  info: 7,
  verb: 8,
  debug: 9,
  wth: 10,
} as const;

/** Derived from LEVEL_METHODS — adding a level here is the only change needed. */
export type LogLevel = keyof typeof LEVEL_METHODS;

/** All log levels as an array, ordered from most to least critical. */
export const LogLevels = Object.keys(LEVEL_METHODS) as LogLevel[];

/**
 * Levels that produce a call-site trace even when `stack` is disabled.
 * The caller is always captured in the proxy for these levels so that
 * browser devtools can display it alongside the log output.
 */
export const TRACE_LEVELS = new Set<LogLevel>([
  'emerg',
  'alert',
  'crit',
  'error',
  'warn',
]);

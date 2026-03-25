import type { InspectOptions } from 'node:util';
import type { LogLevel } from './logger/levels';

export type { LogLevel } from './logger/levels';

/** Arguments accepted by any `console.log`-style method. */
export type LogParameters = Parameters<typeof console.log>;

/** A spinner handle returned by `LogMethod.spin()`. */
export interface LoggerSpinner {
  start(): LoggerSpinner;
  update(text: string, options?: SpinnerUpdateOptions): void;
  success(text?: string, options?: SpinnerUpdateOptions): void;
  fail(text?: string, options?: SpinnerUpdateOptions): void;
  stop(): void;
}

/** Options for creating a spinner via `.spin()`. */
export type SpinnerOptions = {
  runningIcon?: string;
  successIcon?: string;
  failIcon?: string;
  duration?: boolean;
  autoStart?: boolean;
  /** When true, the spinner shows a progress bar. Progress values passed to `update()` are ignored if this flag is not set. */
  progress?: boolean;
};

/** Options passed to `update()`, `success()` and `fail()`. */
export type SpinnerUpdateOptions = {
  /** Progress: either a ratio 0–1, or a `{ done, total }` pair. */
  progress?: number | { done: number; total: number };
  /**
   * Override the animated icon:
   * - `string` — displays this fixed character instead of cycling through frames.
   * - `""` — displays no icon at all.
   * - `null` — resets to the default animation.
   */
  icon?: string | null;
};

/** Options for `LogMethod.exec()`. */
export type ExecOptions = {
  /** Human-readable name of the action, used in start/success/fail messages. */
  label?: string;
};

/**
 * A log method callable directly (`logger.info('msg')`) and also carrying:
 * - `.spin()` — starts a spinner at the same log level.
 * - `.exec()` — runs a promise while displaying a spinner.
 */
export type LogMethod = {
  (...args: LogParameters): void;
  /** Starts a spinner at this log level. */
  spin: (
    message: string,
    options?: Omit<SpinnerOptions, 'text'> & { console?: true },
  ) => LoggerSpinner;
  /**
   * Runs `promiseOrFactory` while displaying a spinner (via `.spin()`).
   * Marks the spinner as successful on resolution, or failed on rejection
   * (the error is always re-thrown).
   */
  exec: <T>(
    promiseOrFactory: Promise<T> | (() => Promise<T>),
    options?: ExecOptions,
  ) => Promise<T>;
};

export type LoggerOptions = {
  /** When false, all output from this logger is suppressed. */
  enabled: boolean;
  /** Append the call-site (file/line/function) to each log line. */
  stack: boolean;
  /** Prepend a timestamp to each log line. */
  date: boolean;
  /**
   * Maximum level to emit. Messages with a higher numeric level are dropped.
   * `undefined` means no filtering.
   */
  level: LogLevel | undefined;
  /** Pad level labels to the same width for alignment (Node TTY only). */
  pad: boolean;
  /** Enable ANSI colour in prefixes. */
  color: boolean;
  /** Prefix each inspected object with a short unique ID for cross-log tracing. */
  uid: boolean;
  /** Options forwarded to `util.inspect` when serialising non-string arguments (Node only). */
  inspect: InspectOptions;
};

/** The minimal shape shared by root loggers and scopes. */
export type GenericLogger = {
  [key in LogLevel]: LogMethod;
} & {
  log: (level: LogLevel, ...args: LogParameters) => void;
};

/**
 * A rate-limited view of a logger returned by `.once()` and `.limit()`.
 * Log methods are plain callables with no `.spin()` or `.exec()`.
 */
export type LimitedLogger = {
  [key in LogLevel]: typeof console.log;
} & {
  log: (level: LogLevel, ...args: LogParameters) => void;
};

export interface Logger extends GenericLogger, LoggerOptions {
  /**
   * When true, all other loggers are silenced — only this logger produces output.
   * Toggle by assigning `true`; assign `false` to release the exclusive lock.
   */
  exclusive: boolean;

  /** Returns a rate-limited logger that emits at most one message per call-site. */
  once(key?: string): LimitedLogger;
  /** Returns a rate-limited logger that emits at most `count` messages per call-site. */
  limit(count: number, key?: string): LimitedLogger;
  /** Returns a one-shot logger with additional option overrides applied. */
  options(overrides: Partial<Omit<LoggerOptions, 'level'>>): GenericLogger;
}

export interface RootLogger extends Logger {
  /**
   * Output format used in non-TTY Node mode.
   * - `'pretty'` — human-readable prefixed lines.
   * - `'json'`   — newline-delimited JSON.
   * - `'logfmt'` — key=value pairs.
   * @default 'json'
   */
  format: 'pretty' | 'json' | 'logfmt';

  /** Returns (or lazily creates) a named child logger that inherits root options. */
  scope(scopeName: string, options?: Partial<LoggerOptions>): ScopeLogger;

  /**
   * Monkey-patches the global `console` methods to route through this logger.
   */
  patch(): void;
  /** Restores the original `console` methods. */
  unpatch(): void;

  /**
   * Redirects all logger output to `console` instead of the system console.
   * Call `restore()` to revert.
   */
  bypass(console: Console): void;
  /** Restores output back to the system console after a `bypass()` call. */
  restore(): void;

  /**
   * Internal — do not call directly.
   * Used by the worker script to dispatch a log line with a call-site string
   * pre-captured in the main process, bypassing worker-side stack introspection.
   */
  __logFromMainProcess(
    level: LogLevel,
    caller: string | undefined,
    args: unknown[],
    ts?: number,
    traceCaller?: string,
    callerStructuredOnly?: boolean,
  ): void;
}

export interface ScopeLogger extends Logger {
  readonly scope: string;

  /**
   * Internal — do not call directly.
   * Used by the worker script to dispatch a log line with a call-site string
   * pre-captured in the main process, bypassing worker-side stack introspection.
   */
  __logFromMainProcess(
    level: LogLevel,
    caller: string | undefined,
    args: unknown[],
    ts?: number,
    traceCaller?: string,
  ): void;
}

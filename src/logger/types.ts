import type { InspectOptions } from 'node:util';
import type { LogLevel } from './levels';

export type { LogLevel } from './levels';

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
  /** When true, the spinner shows a progress bar instead of an icon. Progress values passed to `update()` are ignored if this flag is not set. */
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
 * - `.exec()` — runs a promise while displaying a spinner via `.spin()`,
 *   so both share the same level and lifecycle handling.
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

/** Internal per-logger state. */
export type LoggerState = {
  /** Explicitly configured options — undefined means "not set, cascade to parent". */
  options: Partial<LoggerOptions>;
  /** Defined only for scope loggers. */
  scope?: string;
};

export type LoggerOptions = {
  /** When false, all output from this logger is suppressed. */
  enabled: boolean;
  /** Append the call-site (file/line/function) to each log line. */
  stack: boolean;
  /** Prepend a timestamp to each log line. */
  date: boolean;
  /**
   * Maximum level to emit.  Messages with a higher numeric level are dropped.
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
 * Log methods are plain callables with no `.spin()` or `.exec()` — spinners
 * make no sense on a logger that may silently drop messages.
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

  /**
   * Returns a rate-limited logger that emits at most one message per call-site.
   * Pass an explicit `key` to share the counter across multiple call-sites.
   */
  once(key?: string): LimitedLogger;
  /**
   * Returns a rate-limited logger that emits at most `count` messages per call-site.
   * Pass an explicit `key` to share the counter across multiple call-sites.
   */
  limit(count: number, key?: string): LimitedLogger;
  /** Returns a one-shot logger with additional option overrides applied on top. Level cannot be overridden here — use the `level` setter instead. */
  options(overrides: Partial<Omit<LoggerOptions, 'level'>>): GenericLogger;
}

export interface RootLogger extends Logger {
  /**
   * Output format used in non-TTY Node mode (piped output, CI, log aggregators).
   *
   * - `'pretty'` — human-readable prefixed lines, same as TTY/browser output.
   * - `'json'`   — newline-delimited JSON (`{time, channel, severity, scope?, msg, …data}`).
   * - `'logfmt'` — key=value pairs, suitable for tools like Loki or Datadog.
   *
   * **Ignored in browser devtools and Node TTY**
   *
   * @default 'json'
   */
  format: 'pretty' | 'json' | 'logfmt';

  /**
   * Returns (or lazily creates) a named child logger that inherits root options
   * but can override them independently.
   */
  scope(scopeName: string, options?: Partial<LoggerOptions>): ScopeLogger;

  /**
   * Monkey-patches the global `console` methods to route through this logger,
   * so third-party code that calls `console.log` etc. benefits from the same
   * formatting and level filtering.
   */
  patch(): void;
  /** Restores the original `console` methods saved at module load time. */
  unpatch(): void;
}

export interface ScopeLogger extends Logger {
  readonly scope: string;
}

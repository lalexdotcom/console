import os, { EOL } from 'node:os';
import process, { env } from 'node:process';
import type { WriteStream } from 'node:tty';
import { type InspectOptions, stripVTControlCharacters } from 'node:util';
import { colorize } from '../utils/color';
import {
  CONSOLE_SPINNER_INTERVAL,
  DEFAULT_BROWSER_FAIL_STYLE,
  DEFAULT_BROWSER_RUNNING_STYLE,
  DEFAULT_BROWSER_SUCCESS_STYLE,
  DEFAULT_CONSOLE_FAIL_ICON,
  DEFAULT_CONSOLE_RUNNING_ICON,
  DEFAULT_CONSOLE_SUCCESS_ICON,
  DEFAULT_LOGGER_OPTIONS,
  DEFAULT_TTY_FAIL_ICON,
  DEFAULT_TTY_SPINNER,
  DEFAULT_TTY_SUCCESS_ICON,
  SPINNER_REFRESH_INTERVAL,
  TTY_REFRESH_INTERVAL,
} from './const';
import { inBrowser, inNode, systemConsole, utilInspect } from './env';
import {
  css,
  DEFAULT_BROWSER_STYLE,
  DEFAULT_INSPECT_OPTIONS,
  LEVEL_METHODS,
  type LogLevelStyle,
  LogLevels,
} from './levels';
import { getDatePrefix, getDurationPrefix, getPrefix } from './prefix';
import type {
  GenericLogger,
  Logger as ILogger,
  LoggerOptions,
  LoggerSpinner,
  LogLevel,
  LogMethod,
  LogParameters,
  RootLogger,
  ScopeLogger,
  SpinnerOptions,
} from './types';

export { LogLevels } from './levels';
export type {
  LoggerOptions,
  LoggerSpinner,
  LogLevel,
  LogMethod,
  RootLogger,
  ScopeLogger,
  SpinnerOptions,
} from './types';

/**
 * The console currently used for output.
 * Can be temporarily swapped via `RootLogger.bypass()` / `.restore()`.
 */
let activeConsole = systemConsole;

/**
 * Singleton container stored on `globalThis` under a fixed key so that the
 * same registry is shared even when multiple copies of this module are loaded
 * (e.g. duplicate packages in node_modules, CJS + ESM dual-load, etc.).
 */
type LoggerRegistry = {
  root: RootLoggerInstance;
  scopes: { [key: string]: ScopeLoggerInstance | undefined };
  /** The logger that currently holds the exclusive lock, if any. */
  exclusive?: ILogger;
};

abstract class LoggerBase implements ILogger {
  options: LoggerOptions;
  lastLog?: number;

  /**
   * Builds the `LogMethod` for a given level.
   * The returned function is both directly callable and carries a `.spin()`
   * factory.  Spinner selection priority:
   *   1. TTYSpinner  — when stdout is a real TTY and `console` option is not true.
   *   2. NodeConsoleSpinner — Node, non-TTY (e.g. CI pipe).
   *   3. BrowserConsoleSpinner — browser context.
   */
  private static createLogMethod = (
    logger: LoggerBase,
    level: LogLevel,
  ): LogMethod => {
    const logFunction = (...args: LogParameters) =>
      logger.logAtLevel(level, ...args);
    logFunction.spin = (
      message: string,
      options?: Omit<SpinnerOptions & { console?: boolean }, 'text'> & {
        tty?: boolean;
      },
    ): LoggerSpinner => {
      let spinner: LoggerSpinner;
      if (!options?.console && stdOut?.isTTY) {
        spinner = new TTYSpinner(logger, level, {
          ...options,
          text: message,
        });
      } else {
        spinner = inNode
          ? new NodeConsoleSpinner(logger, level, {
              duration: true,
              ...options,
              text: message,
            })
          : new BrowserConsoleSpinner(logger, level, {
              duration: true,
              ...options,
              text: message,
            });
      }
      spinner.start();
      return spinner;
    };
    return logFunction;
  };

  /** Per-call-site limit proxies, keyed by the stack-derived call identifier. */
  #limits: { [key: string]: GenericLogger } = {};

  /**
   * Returns a Proxy that transparently forwards all logger calls but silently
   * drops log-level methods once `count` calls have been made through it.
   * NOTE: `proxyCount` is shared across all levels — every call to any level
   * method increments the same counter.
   */
  #limitedProxy(count: number): GenericLogger {
    let proxyCount = 0;
    return new Proxy(this, {
      get(target, prop) {
        if (prop in LEVEL_METHODS && ++proxyCount > count) return () => {};
        const method = target[prop as keyof typeof target];
        return method;
      },
    });
  }

  readonly emerg!: LogMethod;
  readonly alert!: LogMethod;
  readonly crit!: LogMethod;
  readonly error!: LogMethod;
  readonly warn!: LogMethod;
  readonly notice!: LogMethod;
  readonly info!: LogMethod;
  readonly verb!: LogMethod;
  readonly debug!: LogMethod;
  readonly wth!: LogMethod;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = { ...DEFAULT_LOGGER_OPTIONS, ...options };
    for (const [method, level] of Object.entries(LEVEL_METHODS)) {
      // Dynamically assigns `this.info`, `this.warn`, etc. at construction time.
      // TypeScript does not see this as satisfying the readonly declarations
      // above, hence the cast.  A cleaner alternative would be a getter per level.
      this[method as LogLevel] = LoggerBase.createLogMethod(
        this,
        method as LogLevel,
      );
    }
  }

  once(key?: string): GenericLogger {
    return this.limit(1, key ?? getCallerLimitKey());
  }

  limit(key: string): GenericLogger;
  limit(count: number, key?: string): GenericLogger;
  limit(countOrKey: number | string, key?: string): GenericLogger {
    let callKey = key;
    if (typeof countOrKey === 'string') {
      // String-only overload: retrieves an already-created limit proxy by key.
      // ⚠️  Throws with an incomplete message if the key was never registered.
      if (!this.#limits[countOrKey]) {
        throw new Error('Limit ');
      }
      return this.#limits[countOrKey];
    }
    // Derive a stable key from the call-site stack frame when none is provided.
    callKey ??= getCallerLimitKey();
    if (callKey === undefined) {
      throw new Error('Invalid key', callKey);
    }
    // Create the proxy lazily and cache it under the call-site key.
    // biome-ignore lint/suspicious/noAssignInExpressions: intentional lazy-init idiom
    return (this.#limits[callKey] ??= this.#limitedProxy(countOrKey));
  }

  protected logAtLevel(level: LogLevel, ...args: LogParameters) {
    return outputLog(level, args, this);
  }

  getPrefix(level: LogLevel) {
    const options = computeOptions(this);
    const scope = this instanceof ScopeLoggerInstance ? this.scope : undefined;
    return getPrefix(level, options, scope);
  }

  log(level: LogLevel, ...args: LogParameters): void {
    this.logAtLevel(level, ...args);
  }

  get exclusive() {
    return registry.exclusive === this;
  }

  set exclusive(b: boolean) {
    registry.exclusive = this.exclusive ? undefined : this;
  }

  protected setOption<K extends keyof LoggerOptions>(
    key: K,
    value: LoggerOptions[K],
  ) {
    this.options[key] = value;
  }

  protected getOption<K extends keyof LoggerOptions>(key: K) {
    return this.options[key];
  }

  get enabled() {
    return this.getOption('enabled');
  }

  set enabled(b: boolean) {
    this.setOption('enabled', b);
  }

  get uid() {
    return this.getOption('uid');
  }

  set uid(b: boolean) {
    this.setOption('uid', b);
  }

  get stack() {
    return this.getOption('stack');
  }

  set stack(b: boolean) {
    this.setOption('stack', b);
  }

  get date() {
    return this.getOption('date');
  }

  set date(b: boolean) {
    this.setOption('date', b);
  }

  get duration() {
    return this.getOption('duration');
  }

  set duration(b: boolean) {
    this.setOption('duration', b);
  }

  get level() {
    return this.getOption('level');
  }

  set level(lvl: LogLevel | undefined) {
    this.setOption('level', lvl);
  }

  get pad() {
    return this.getOption('pad');
  }

  set pad(b: boolean) {
    this.setOption('pad', b);
  }

  set inspect(opts: InspectOptions) {
    this.setOption('inspect', { ...opts });
  }

  get inspect() {
    return { ...this.getOption('inspect') };
  }

  set color(b: boolean) {
    this.setOption('color', b);
  }

  get color() {
    return this.getOption('color');
  }
}

class RootLoggerInstance extends LoggerBase implements RootLogger {
  /**
   * Snapshot of the original console methods taken at module load time.
   * Used by `unpatch()` to restore the global console.
   * ⚠️  `console.log` is captured here but is NOT in the patch() override map,
   * so unpatch() restores it via the loop even though patch() only assigns
   * console.log through the chained assignment (`console.log = console.info = …`).
   */
  private static __originalMethods: Partial<
    Record<keyof typeof console, typeof console.log>
  > = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
    warn: console.warn,
  };

  private static __originalConsole: Console = systemConsole;

  /** Lazily creates and caches a `ScopeLoggerInstance` for `scopeName`. */
  scope(scopeName: string, options: Partial<LoggerOptions> = {}): ScopeLogger {
    let scopeLogger = registry.scopes[scopeName];
    scopeLogger ??= registry.scopes[scopeName] = new ScopeLoggerInstance(
      scopeName,
      this,
      options,
    );
    return scopeLogger;
  }

  /** Temporarily redirects output to an alternative console (e.g. for testing). */
  bypass(console: Console) {
    activeConsole = console;
  }

  /** Reverts `bypass()` — restores the console captured at module load time. */
  restore() {
    activeConsole = systemConsole;
  }

  /**
   * Monkey-patches the global `console` to route through this logger.
   * ⚠️  The chained assignment `console.log = console.info = …` is valid JS
   * (both are set to the same bound function) but reads confusingly — the
   * second `console.info = …` line is then redundant.
   */
  patch() {
    console.log = console.info = this.info.bind(this);
    console.info = this.info.bind(this);
    console.debug = this.debug.bind(this);
    console.warn = this.warn.bind(this);
    console.error = this.crit.bind(this);
  }

  unpatch() {
    for (const k of Object.keys(RootLoggerInstance.__originalMethods)) {
      const method = k as keyof typeof console;
      // biome-ignore lint/suspicious/noExplicitAny: console methods share the same shape but TS types diverge
      if (method)
        console[method] = RootLoggerInstance.__originalMethods[method] as any;
    }
  }
}

class ScopeLoggerInstance extends LoggerBase implements ScopeLogger {
  readonly scope: string;
  readonly parent: RootLogger;

  constructor(
    scope: string,
    root: RootLoggerInstance,
    options?: Partial<LoggerOptions>,
  ) {
    super(options);
    this.scope = scope;
    this.parent = root;
  }
}

const LEVEL_PARAMS: { [key in LogLevel]: { methods: (typeof console.log)[] } } =
  {
    emerg: {
      methods: [
        (...params) => activeConsole.error(...params),
        (...params) => activeConsole.trace(...params),
      ],
    },
    alert: {
      methods: [
        (...params) => activeConsole.error(...params),
        (...params) => activeConsole.trace(...params),
      ],
    },
    crit: {
      methods: [
        (...params) => activeConsole.error(...params),
        (...params) => activeConsole.trace(...params),
      ],
    },
    error: {
      methods: [(...params) => activeConsole.error(...params)],
    },
    warn: {
      methods: [(...params) => activeConsole.warn(...params)],
    },
    notice: {
      methods: [(...params) => activeConsole.info(...params)],
    },
    info: {
      methods: [(...params) => activeConsole.info(...params)],
    },
    verb: {
      methods: [(...params) => activeConsole.debug(...params)],
    },
    debug: {
      methods: [(...params) => activeConsole.debug(...params)],
    },
    wth: {
      methods: [(...params) => activeConsole.debug(...params)],
    },
  };

/**
 * Merges a scope logger's own options with the root logger's options.
 * Rules per option:
 *  - `level`    → the stricter (lower numeric value) of root vs scope wins.
 *  - boolean flags (`date`, `duration`, `pad`, `stack`) → root OR scope (root enables globally).
 *  - `color`    → root AND scope (root can disable globally).
 *  - `inspect`  → shallow-merge, scope overrides root.
 */
const computeOptions = (logger: LoggerBase) => {
  const computed = { ...logger.options };
  const root = registry.root;
  for (const [key, value] of Object.entries(computed)) {
    switch (key) {
      case 'level':
        computed[key] =
          root.level === undefined
            ? computed.level
            : computed.level === undefined
              ? root.level
              : LEVEL_METHODS[root.level] < LEVEL_METHODS[computed.level]
                ? root.level
                : computed.level;
        break;
      case 'date':
      case 'duration':
      case 'pad':
      case 'stack':
        computed[key] ||= root[key];
        break;
      case 'color':
        computed[key] &&= root[key];
        break;
      case 'inspect':
        computed[key] = { ...root.options[key], ...computed[key] };
        break;
    }
  }
  return computed;
};

let CURRENT_UID = 0;
const UID_MAP = new Map<unknown, typeof CURRENT_UID>();

/**
 * Core output function called by every log method and spinner display.
 * Applies all enabled prefixes (level, date, duration, stack) then dispatches
 * to the appropriate `console.*` method(s) defined for the level.
 *
 * When a TTY refresh loop is active (spinner running), output is buffered
 * instead of being written directly so the in-place redraw stays consistent.
 */
const outputLog = (
  logLevel: LogLevel,
  args: LogParameters,
  logger: LoggerBase,
  override?: { prefix?: string | string[] },
) => {
  try {
    // Three distinct kill-switches: per-logger, global root, or environment variable.
    if (!logger.enabled || !root.enabled || env.LLOGGER_ENABLED === 'false')
      return;
    // Exclusive mode: suppress every logger except the one holding the lock.
    if (registry.exclusive && registry.exclusive !== logger) return;

    const {
      date,
      duration: time,
      level,
      stack,
      inspect,
      uid,
    } = computeOptions(logger);

    if (!LEVEL_PARAMS[logLevel]) return;
    if (level && LEVEL_METHODS[level] < LEVEL_METHODS[logLevel]) return;
    const levelParams = LEVEL_PARAMS[logLevel];

    const logPrefix: string[] = override?.prefix
      ? Array.isArray(override?.prefix)
        ? override.prefix
        : [override.prefix]
      : logger.getPrefix(logLevel);

    if (time || date) {
      if (time) logger.lastLog ??= new Date().valueOf();
      const now: Date = new Date();
      if (date) {
        const datePrefix = getDatePrefix(now);
        logPrefix.push(datePrefix);
      }
      if (time) {
        const timePrefix = getDurationPrefix(
          now.valueOf() - (logger.lastLog ?? 0),
        );
        logger.lastLog = new Date().valueOf();
        logPrefix.push(timePrefix);
      }
    }
    if (stack) {
      const caller = getLogCallerInfo();
      let stackDisplay =
        caller?.functionName ||
        `${caller?.fileName?.split('/').slice(-1).join('/')}:${caller?.lineNumber}:${caller?.columnNumber}`;
      if (caller?.functionName && caller?.fileName)
        stackDisplay += ` @ ${caller?.fileName}:${caller?.lineNumber}:${caller?.columnNumber}`;
      if (stackDisplay) logPrefix.push(`(${stackDisplay})`);
    }

    let callArgs = args;
    if (inNode && utilInspect) {
      const _inspect = utilInspect;
      try {
        callArgs = args.map((a) =>
          typeof a === 'string'
            ? a
            : _inspect(a, inspect ?? DEFAULT_INSPECT_OPTIONS),
        );
      } catch (e) {}
    }
    if (uid) {
      callArgs = args.flatMap((a) => {
        if (typeof a === 'object' || typeof a === 'function') {
          let objectUID = UID_MAP.get(a);
          if (objectUID === undefined) {
            // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
            UID_MAP.set(a, (objectUID = ++CURRENT_UID));
          }
          return [{ _uid: `#${objectUID}` }, a];
        }
        return [a];
      });
    }
    if (isRefreshing()) {
      const outputString = [...logPrefix, ...callArgs]
        .map((a) => a.toString())
        .join(' ');
      addContentToBuffer(outputString);
    } else {
      levelParams.methods.map((method) =>
        method.apply(globalThis, [...logPrefix, ...callArgs]),
      );
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : JSON.stringify(e));
  }
};

/**
 * Returns a unique string identifying the call site of the `limit()` / `once()`
 * invocation. The magic number `4` is the stack depth from `getCallerStack` to
 * the user's call frame — fragile if the call chain changes or bundlers inline.
 */
const getCallerLimitKey = () => getCallerStack(4);
/**
 * Parses the call-site info (file, line, column, function name) from the
 * stack frame of the user's `logger.xxx()` call.
 * Stack depth 6 accounts for: Error → getCallerStack → getLogCallerInfo →
 * outputLog → logAtLevel → logFunction → user code.
 */
const getLogCallerInfo = ():
  | {
      functionName?: string;
      fileName?: string;
      columnNumber?: string;
      lineNumber?: string;
    }
  | undefined => {
  const stack = getCallerStack(6);
  if (stack) {
    return inNode
      ? stack.match(
          /at (?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)/,
        )?.groups
      : stack.match(
          /at (?<functionName>.*) \(?(?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)\)/,
        )?.groups;
  }
};

const getCallerStack = (level: number): string | undefined => {
  let err: Error;
  try {
    throw new Error();
  } catch (e) {
    err = e as Error;
  }
  const stack = err.stack?.split('\n') || [];
  return stack.slice(level)[0];
};

/**
 * IIFE that initialises (or retrieves) the shared registry from `globalThis`.
 * Storing it on `globalThis` ensures a single root logger even if this module
 * is evaluated multiple times (CJS + ESM interop, duplicate installs, etc.).
 */
const registry = (() => {
  if (typeof globalThis === 'undefined') throw new Error('No globalThis found');
  const anyGlobal = globalThis as Record<string, unknown>;
  const registryName = '$logger-registry';
  if (!anyGlobal[registryName]) {
    const emptyRegistry: LoggerRegistry = {
      root: new RootLoggerInstance(),
      scopes: {},
    };
    anyGlobal[registryName] = emptyRegistry;
  }
  return anyGlobal[registryName] as LoggerRegistry;
})();

const root = registry.root;

export const Logger: RootLogger = root;
export const L = Logger;

// Spinner

abstract class AbstractConsoleSpinner<
  OptionsType extends SpinnerOptions = SpinnerOptions,
> {
  private prefix?: string | false;
  protected text = '';

  protected icon?: string;
  protected iteration = 0;

  protected logger: LoggerBase;
  protected level: LogLevel;

  // private _loggerOptions: LoggerOptions;

  protected started?: Date;
  protected stopped?: Date;

  protected options: Omit<OptionsType, 'text'>;

  private nextTimeout?: ReturnType<typeof setTimeout>;

  constructor(logger: LoggerBase, level: LogLevel, options: OptionsType) {
    this.logger = logger;
    this.level = level;
    // this._loggerOptions = { ...computeOptions(logger) };
    const { text, ...spinOptions } = options ?? ({} as OptionsType);
    this.options = { ...spinOptions };
    this.icon = spinOptions.runningIcon ?? DEFAULT_CONSOLE_RUNNING_ICON;
    this.setText(text ?? '');
  }

  setText(text: string) {
    this.text = text;
  }

  start() {
    if (!this.started) {
      this.started = new Date();
      this.iteration = 1;
      this.tick();
    }
  }

  update(text: string) {
    this.setText(text);
  }

  success(text?: string) {
    if (text !== undefined) this.setText(text);
    this.icon = this.options.successIcon ?? DEFAULT_CONSOLE_SUCCESS_ICON;
    this.stop();
  }

  fail(text?: string) {
    if (text !== undefined) this.setText(text);
    this.icon = this.options.failIcon ?? DEFAULT_CONSOLE_FAIL_ICON;
    this.stop();
  }

  stop() {
    if (this.nextTimeout) clearTimeout(this.nextTimeout);
    this.stopped = new Date();
    this.tick();
  }

  /**
   * Always calls `display()` immediately, then schedules the next tick when
   * the spinner is still running.
   *
   * ⚠️  Bug: `clearTimeout(this.nextTimeout)` is called AFTER the reference has
   * been set to `undefined`, making it a no-op (`clearTimeout(undefined)`).
   * The intent was probably to clear any leftover timeout before recursing, but
   * since `this.nextTimeout` is already `undefined` at that point it has no
   * effect.  The line should be removed.
   */
  tick() {
    this.display();
    if (this.started && !this.stopped) {
      if (!this.nextTimeout) {
        this.nextTimeout = setTimeout(() => {
          this.iteration++;
          this.nextTimeout = undefined;
          clearTimeout(this.nextTimeout); // ⚠️ no-op — see JSDoc above
          this.tick();
        }, CONSOLE_SPINNER_INTERVAL);
      }
    }
  }

  abstract display(): void;
}

class NodeConsoleSpinner
  extends AbstractConsoleSpinner
  implements LoggerSpinner
{
  constructor(logger: LoggerBase, level: LogLevel, options: SpinnerOptions) {
    super(logger, level, {
      ...options,
      runningIcon:
        options.runningIcon ??
        colorize(` ${DEFAULT_CONSOLE_RUNNING_ICON} `, {
          color: 'black',
          'background-color': 'grey',
        }),
      failIcon:
        options.failIcon ??
        colorize(` ${DEFAULT_CONSOLE_FAIL_ICON} `, {
          color: 'white',
          'background-color': 'red',
        }),
      successIcon:
        options.successIcon ??
        colorize(` ${DEFAULT_CONSOLE_SUCCESS_ICON} `, {
          color: 'white',
          'background-color': 'green',
        }),
    });
  }

  display() {
    const texts = [this.text];
    if (this.options.duration && this.started) {
      texts.unshift(`[${getDurationPrefix(this.started, this.stopped)}]`);
    } else {
      if (!this.stopped) texts.push(''.padStart(this.iteration, '.'));
    }

    outputLog(this.level, texts, this.logger, {
      prefix: [...this.logger.getPrefix(this.level), this.icon ?? ''],
    });
  }
}

type BrowserConsoleSpinnerOptions = SpinnerOptions & {
  successStyle?: string;
  failStyle?: string;
  runningStyle?: string;
};

class BrowserConsoleSpinner
  extends AbstractConsoleSpinner<BrowserConsoleSpinnerOptions>
  implements LoggerSpinner
{
  private style: string;

  /**
   * ⚠️  Bug: `Object.keys()` returns `string[]`, so the destructured `[k, v]`
   * pattern treats each key character as `k` and leaves `v` undefined.
   * This should use `Object.entries()` instead.
   * This method is also never called (the module-level `css()` function is used
   * everywhere), making it dead code.
   */
  static styleToCss = (style: object) => {
    return Object.keys({ ...DEFAULT_BROWSER_STYLE, ...style })
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
  };

  constructor(
    logger: LoggerBase,
    level: LogLevel,
    options: BrowserConsoleSpinnerOptions,
  ) {
    super(logger, level, options);
    this.style = css(DEFAULT_BROWSER_RUNNING_STYLE);
  }

  success(text?: string): void {
    this.style =
      this.options.successStyle ?? css(DEFAULT_BROWSER_SUCCESS_STYLE);
    super.success(text);
  }

  fail(text?: string): void {
    this.style = this.options.failStyle ?? css(DEFAULT_BROWSER_FAIL_STYLE);
    super.fail(text);
  }

  display() {
    const [pfx, color1] = this.logger.getPrefix(this.level);
    const texts = [this.text];
    if (this.options.duration && this.started) {
      texts.unshift(`[${getDurationPrefix(this.started, this.stopped)}]`);
    } else {
      if (!this.stopped) texts.push(''.padStart(this.iteration, '.'));
    }
    outputLog(this.level, texts, this.logger, {
      prefix: [
        `${pfx}%c %c${this.icon}`,
        color1,
        'background-color: unset; color: unset',
        this.style,
      ],
    });
  }
}

type TTYSpinnerOptions = SpinnerOptions;

class TTYSpinner implements LoggerSpinner {
  private _prefix?: string | false;
  private _text = '';

  private _iconIndex!: number;
  private _icon!: string | string[] | null;

  private _logger: LoggerBase;
  private _level: LogLevel;

  // private _loggerOptions: LoggerOptions;

  $started?: Date;
  $stopped?: Date;

  private options: TTYSpinnerOptions;

  constructor(logger: LoggerBase, level: LogLevel, options: TTYSpinnerOptions) {
    this._logger = logger;
    this._level = level;
    // this._loggerOptions = { ...computeOptions(logger) };
    this.options = options;
    this._prefix = this.options.prefix;
    this.setText(this.options.text);
    this.icon = (this.options.runningIcon ?? DEFAULT_TTY_SPINNER).split('||');

    this.start();
  }

  setText(text: string) {
    this._text = text;
  }

  set icon(icon: string | string[] | null) {
    this._icon = icon;
    this._iconIndex = 0;
  }

  get icon(): string | string[] | null {
    return this._icon;
  }

  start() {
    if (!root.enabled || !this._logger.enabled) return;
    if (!this.$started) {
      this.$started = new Date();
      runningSpinners.add(this);
      if (!isRefreshing()) startRefresh();
      if (!isRefreshing())
        this._logger.log(this._level, ...this.toString(false));
    }
  }

  update(text: string) {
    this.setText(text);
  }

  success(text?: string) {
    if (text !== undefined) this.setText(text);
    this.icon = this.options.successIcon ?? DEFAULT_TTY_SUCCESS_ICON;
    this.stop();
  }

  fail(text?: string) {
    if (text !== undefined) this.setText(text);
    this.icon = this.options.failIcon ?? DEFAULT_TTY_FAIL_ICON;
    this.stop();
  }

  stop() {
    if (!this.$stopped && !!this.$started) {
      this.$stopped = new Date();
      runningSpinners.delete(this);
      addContentToBuffer(this.toString());
      if (!isRefreshing()) {
        this._logger.log(this._level, this.toString(false));
      } else if (!runningSpinners.size) {
        stopRefresh();
      }
    }
  }

  spin() {
    if (
      this.$started &&
      !this.$stopped &&
      this._icon &&
      this._icon.length > 1
    ) {
      this._iconIndex++;
      if (this._iconIndex >= this._icon.length) this._iconIndex = 0;
    }
  }

  toString(withLevelPrefix?: boolean) {
    let textString = '';
    if (this._prefix !== false) {
      if (withLevelPrefix ?? true)
        textString += `${this._logger.getPrefix(this._level).join(' ')} `;
      if (this._prefix) textString += `${this._prefix} `;
    }
    if (this.options.date && this.$started) {
      textString += `${getDatePrefix(this.$started)} `;
    }
    if (this.options.duration && this.$started) {
      textString += `${getDurationPrefix(this.$started, this.$stopped)} `;
    }
    if (Array.isArray(this._icon)) {
      if (this._icon?.[this._iconIndex]) {
        textString += `${this._icon?.[this._iconIndex]} `;
      }
    } else if (this._icon !== null) {
      textString += `${this._icon} `;
    }
    textString += this._text;
    return textString;
  }
}

/** All TTYSpinners currently in the `started` (not yet `stopped`) state. */
const runningSpinners: Set<LoggerSpinner> = new Set();
/**
 * Controls the spinner animation tick (advances each spinner's frame index).
 * Also drives TTY refresh indirectly — see `startRefresh()`.
 */
let spinnersRefreshInterval: ReturnType<typeof setInterval> | undefined =
  undefined;
/**
 * Secondary interval that triggers a TTY repaint independently of the spinner
 * tick. Both intervals share the same period, making this effectively redundant.
 * ⚠️  Could be consolidated into a single interval.
 */
let ttyRefreshInterval: ReturnType<typeof setInterval> | undefined = undefined;

/** Cached reference to `process.stdout` for TTY operations. */
const stdOut: WriteStream = process?.stdout;
// const originalStdout = stdOut.write.bind(stdOut);

// const originalStderrWrite = process?.stderr.write.bind(process?.stderr);

// function restoreStderr() {
// 	if (process?.stderr) {
// 		process.stderr.write = originalStderrWrite;
// 	}
// }

// function redirectStderr() {
// 	if (process?.stderr) {
// 		process.stderr.write = process.stdout.write.bind(process.stdout);
// 	}
// }
// const buffer: { content: string; height: number }[] = [];
const newBuffered: string[] = [];
let currentBufferHeight = 0;

function getContentHeight(str: string) {
  const width = stdOut.columns;
  const lines = stripVTControlCharacters(str).split('\n');
  let height = 0;
  for (const line of lines) {
    height += Math.max(1, Math.ceil(line.length / width));
  }
  return height;
}

function isRefreshing() {
  return spinnersRefreshInterval !== undefined;
}

function addContentToBuffer(str: string) {
  const tabbed = str.replaceAll('\t', '   ');
  newBuffered.push(tabbed);
}

/**
 * Starts the TTY refresh loop:
 *   1. Hides the cursor (`\u001B[?25l`) to avoid flicker.
 *   2. Listens for terminal resize events.
 *   3. Starts the spinner animation interval.
 *   4. Starts a secondary repaint interval (currently same period — see note on
 *      `ttyRefreshInterval`).
 * No-op if already refreshing or stdout is not a TTY.
 */
function startRefresh() {
  if (!isRefreshing() && stdOut?.isTTY) {
    stdOut.write('\u001B[?25l');
    stdOut.on('resize', handleTerminalResize);
    spinnersRefreshInterval = setInterval(() => {
      for (const s of runningSpinners) {
        if (s instanceof TTYSpinner) s.spin();
      }
      refreshTTY();
    }, SPINNER_REFRESH_INTERVAL);
    ttyRefreshInterval = setInterval(() => refreshTTY(), TTY_REFRESH_INTERVAL);
    refreshTTY();
  }
}

function handleTerminalResize() {
  currentBufferHeight = 0;
  for (const spinner of [...runningSpinners]) {
    currentBufferHeight += getContentHeight(spinner.toString());
  }
  refreshTTY();
}

/**
 * Erases the currently displayed spinner lines from the terminal.
 * Moves the cursor up line-by-line and clears to end of line.
 * `currentBufferHeight` tracks how many lines were written so we know
 * how far to scroll back.
 */
function clearTTY() {
  stdOut.cursorTo(0);

  for (let index = 0; index < currentBufferHeight; index++) {
    if (index > 0) stdOut.moveCursor(0, -1);
    stdOut.clearLine(1);
  }

  currentBufferHeight = 0;
}

function stopRefresh() {
  if (isRefreshing()) {
    refreshTTY();
    stdOut.write(os?.EOL);
    stdOut.write('\u001B[?25h');

    stdOut.off('resize', handleTerminalResize);

    clearInterval(spinnersRefreshInterval);
    spinnersRefreshInterval = undefined;

    clearInterval(ttyRefreshInterval);
    ttyRefreshInterval = undefined;

    currentBufferHeight = 0;
  }
}

function refreshTTY() {
  if (!isRefreshing()) return;

  clearTTY();

  // Write buffer and update height
  stdOut.write(
    newBuffered
      .concat(
        // Display running spinners at the end
        [...runningSpinners]
          .filter((sp) => sp instanceof TTYSpinner)
          .map((sp) => {
            const spinnerContent = sp.toString();
            currentBufferHeight += getContentHeight(spinnerContent);
            return spinnerContent;
          }),
      )
      .join(EOL),
  );
  newBuffered.length = 0;
  // computeBufferHeight();
}

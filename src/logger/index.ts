import { DEFAULT_LOGGER_OPTIONS } from './const';
import type { DispatchFn } from './dispatch';
import { env, isNode, isNodeTTY, systemConsole, utilInspect } from './env';
import { LEVEL_METHODS, LogLevels } from './levels';
import { createLimitMixin } from './mixins/limit';
import { createOverrideMixin } from './mixins/override';
import { createSpinnerMixin } from './mixins/spinner';
import { ttyRenderer } from './mixins/spinner/tty/renderer';
import type { Prefix } from './prefix';
import { getPrefix } from './prefix';
import { renderBrowserPrefix, renderConsolePrefix, renderTTYPrefix } from './prefix/render';
import { serializeJSON, serializeLogfmt } from './prefix/serialize';
import { getLogCallerInfo } from './stack';
import type {
  LoggerOptions,
  LoggerState,
  LogLevel,
  LogMethod,
  LogParameters,
  RootLogger,
  ScopeLogger,
} from './types';

export { LogLevels } from './levels';
export type {
  ExecOptions,
  LimitedLogger,
  LoggerOptions,
  LoggerSpinner,
  LogLevel,
  LogMethod,
  RootLogger,
  ScopeLogger,
  SpinnerOptions,
} from './types';

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Singleton container stored on `globalThis` under a fixed key so that the
 * same registry is shared even when multiple copies of this module are loaded
 * (e.g. duplicate packages in node_modules, CJS + ESM dual-load, etc.).
 */
type LoggerRegistry = {
  root: RootLogger;
  /** Live reference to the root logger's raw options object. Used by computeOptions as the penultimate fallback layer. */
  rootOptions: Partial<LoggerOptions>;
  scopes: { [key: string]: ScopeLogger | undefined };
  /** The logger that currently holds the exclusive lock, if any. */
  exclusive?: RootLogger | ScopeLogger;
  /** Output format for non-TTY Node mode. Root-only — ignored in browser and TTY. */
  format: 'pretty' | 'json' | 'logfmt';
};

const registry = (() => {
  if (typeof globalThis === 'undefined') throw new Error('No globalThis found');
  const anyGlobal = globalThis as Record<string, unknown>;
  const registryName = '$logger-registry';
  if (!anyGlobal[registryName]) {
    anyGlobal[registryName] = {
      scopes: {},
      rootOptions: {},
      format: 'json',
    } satisfies Partial<LoggerRegistry>;
  }
  return anyGlobal[registryName] as LoggerRegistry;
})();

// ── Active console (bypass / restore) ─────────────────────────────────────────

let activeConsole = systemConsole;

// ── Original console methods (patch / unpatch) ────────────────────────────────

const __originalConsoleMethods = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  error: console.error,
  warn: console.warn,
} as const;

// ── UID tracking ──────────────────────────────────────────────────────────────

let CURRENT_UID = 0;
const UID_MAP = new Map<unknown, number>();

// ── Level dispatch ────────────────────────────────────────────────────────────

type ConsoleFn = typeof console.log;
const LEVEL_PARAMS: {
  [key in LogLevel]: { method: ConsoleFn; trace?: ConsoleFn };
} = {
  emerg: { method: console.error, trace: console.trace },
  alert: { method: console.error, trace: console.trace },
  crit: { method: console.error, trace: console.trace },
  error: { method: console.error },
  warn: { method: console.warn },
  notice: { method: console.info },
  success: { method: console.info },
  info: { method: console.info },
  verb: { method: console.debug },
  debug: { method: console.debug },
  wth: { method: console.debug },
};

// ── computeOptions ────────────────────────────────────────────────────────────

/**
 * Resolves effective options by cascading through the provided layers, then
 * `registry.rootOptions` (root's live raw options), then `DEFAULT_LOGGER_OPTIONS`.
 *
 * Special cases:
 *  - `level`: the strictest (lowest numeric index) among all defined values wins.
 *  - `inspect`: shallow-merged right-to-left so the leftmost (own) layer wins on key conflicts.
 */
const computeOptions = (...layers: Partial<LoggerOptions>[]): LoggerOptions => {
  const allLayers = [...layers, registry.rootOptions, DEFAULT_LOGGER_OPTIONS];
  const computed = {} as LoggerOptions;

  for (const key of Object.keys(
    DEFAULT_LOGGER_OPTIONS,
  ) as (keyof LoggerOptions)[]) {
    if (key === 'level' || key === 'inspect') continue;
    for (const layer of allLayers) {
      if (layer[key] !== undefined) {
        // biome-ignore lint/suspicious/noExplicitAny: union key — value types are compatible per-key at runtime
        (computed as any)[key] = layer[key];
        break;
      }
    }
  }

  // Level: strictest (lowest LEVEL_METHODS value) wins among all defined candidates.
  const levelCandidates = allLayers
    .map((l) => l.level)
    .filter((v): v is LogLevel => v !== undefined);
  computed.level = levelCandidates.reduce((a, b) =>
    LEVEL_METHODS[a] <= LEVEL_METHODS[b] ? a : b,
  );

  // Inspect: merge from right to left so the leftmost layer wins on key conflicts.
  computed.inspect = Object.assign(
    {},
    ...[...allLayers].reverse().map((l) => l.inspect ?? {}),
  );

  return computed;
};

// ── EmitOptions ──────────────────────────────────────────────────────────────

type EmitOptions = {
  prefix?: string | string[] | null;
  /** One-shot option overrides applied on top of the logger's own options. */
  options?: Partial<LoggerOptions>;
  /** null = suppress stack display entirely (e.g. spinner ticks). */
  stackOffset?: number | null;
  /** Extra prefix items injected by spinners (icon badge, progress bar, …). */
  extraPrefixItems?: Prefix[];
  /** TTY spinner signal: handled before regular line output. */
  ttySpinner?:
    | { action: 'register'; id: symbol; frames: string[]; color?: string; progress?: boolean }
    | { action: 'stop'; id: symbol };
};

// ── prepareLog ────────────────────────────────────────────────────────────────

type PreparedLog = {
  prefix: Prefix[];
  color: boolean;
  callArgs: LogParameters;
  trace: ConsoleFn | undefined;
  method: ConsoleFn;
};

/**
 * Validates guards and resolves the prefix + args for a log line.
 * Returns null when the line must be silently dropped.
 */
function prepareLog(
  logLevel: LogLevel,
  args: LogParameters,
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  options?: EmitOptions,
): PreparedLog | null {
  if (
    !self.enabled ||
    !registry.root.enabled ||
    env.LLOGGER_ENABLED === 'false'
  )
    return null;
  if (registry.exclusive && registry.exclusive !== self) return null;
  if (!LEVEL_PARAMS[logLevel]) return null;

  const resolved = options?.options
    ? computeOptions(options.options, state.options)
    : computeOptions(state.options);
  const { date, level, stack, inspect, uid } = resolved;
  const color = resolved.color;

  if (level && LEVEL_METHODS[level] < LEVEL_METHODS[logLevel]) return null;

  const prefix: Prefix[] =
    options?.prefix === null
      ? []
      : options?.prefix
        ? (Array.isArray(options.prefix) ? options.prefix : [options.prefix]).map(
            (p): Prefix => ({ type: 'text', text: p }),
          )
        : getPrefix(logLevel, {
            pad: resolved.pad,
            scope: state.scope,
            channel: LEVEL_PARAMS[logLevel].method.name,
          });

  if (date) prefix.push({ type: 'date' });

  if (stack && options?.stackOffset !== null) {
    const caller = getLogCallerInfo(options?.stackOffset ?? 0);
    if (caller) {
      let stackDisplay =
        caller.functionName ||
        `${caller.fileName?.split('/').slice(-1)[0]}:${caller.lineNumber}:${caller.columnNumber}`;
      if (caller.functionName && caller.fileName)
        stackDisplay += ` @ ${caller.fileName}:${caller.lineNumber}:${caller.columnNumber}`;
      if (stackDisplay) prefix.push({ type: 'caller', value: stackDisplay });
    }
  }

  if (options?.extraPrefixItems?.length) {
    prefix.push(...options.extraPrefixItems);
  }

  let callArgs = args;
  if (isNode && utilInspect) {
    const _inspect = utilInspect;
    try {
      callArgs = args.map((a) =>
        typeof a === 'string' ? a : _inspect(a, inspect),
      );
    } catch {}
  }

  if (uid) {
    callArgs = args.flatMap((a) => {
      if (typeof a === 'object' || typeof a === 'function') {
        let objectUID = UID_MAP.get(a);
        if (objectUID === undefined) {
          objectUID = ++CURRENT_UID;
          UID_MAP.set(a, objectUID);
        }
        return [{ _uid: `#${objectUID}` }, a];
      }
      return [a];
    });
  }

  const { method, trace } = LEVEL_PARAMS[logLevel];
  return { prefix, color, callArgs, method, trace };
}

// ── emitTTY ───────────────────────────────────────────────────────────────────

/**
 * Writes a prepared log line in TTY mode.
 * Routes through the renderer to preserve cursor-position integrity.
 * Handles spinner register / stop signals before writing.
 */
function emitTTY(
  prepared: PreparedLog,
  ttySpinner?: EmitOptions['ttySpinner'],
): void {
  const { prefix, color, callArgs, trace } = prepared;
  const prefixStr = renderTTYPrefix(prefix, color);

  if (ttySpinner?.action === 'register') {
    ttyRenderer?.addSpinner({
      id: ttySpinner.id,
      text: String(callArgs[0] ?? ''),
      prefix: prefixStr,
      frames: ttySpinner.frames,
      iconIndex: 0,
      color: ttySpinner.color,
      progress: ttySpinner.progress ? 0 : undefined,
    });
    return;
  }

  if (ttySpinner?.action === 'stop') {
    // Remove first so the renderer goes idle before we write the final line.
    ttyRenderer?.removeSpinner(ttySpinner.id);
  }

  const line = (prefixStr ? [prefixStr, ...callArgs] : [...callArgs]).join(' ');
  const write = (s: string) => {
    if (ttyRenderer?.isActive()) ttyRenderer.enqueueLog(s);
    else process.stdout.write(`${s}\n`);
  };
  write(line);

  if (trace) {
    // Capture a clean stack skipping internal logger frames.
    const stack = new Error().stack?.split('\n').slice(6).join('\n');
    if (stack) write(stack);
  }
}

// ── emitConsole ───────────────────────────────────────────────────────────────

/**
 * Writes a prepared log line in non-TTY mode (browser devtools, pipe, CI).
 * Delegates to the native console method bound to `activeConsole` so that
 * `bypass()` continues to work correctly.
 */
function emitConsole(prepared: PreparedLog): void {
  const { prefix, color, callArgs, method, trace } = prepared;
  const format = registry.format;

  if (isNode && (format === 'json' || format === 'logfmt')) {
    const line = format === 'json'
      ? serializeJSON(prefix, callArgs)
      : serializeLogfmt(prefix, callArgs);
    method.apply(activeConsole, [line]);
    return;
  }

  const prefixArgs = isNode
    ? (() => { const s = renderConsolePrefix(prefix); return s ? [s] : []; })()
    : renderBrowserPrefix(prefix, color);
  method.apply(activeConsole, [...prefixArgs, ...callArgs]);
  if (trace) trace.apply(activeConsole);
}

// ── emit ──────────────────────────────────────────────────────────────────────

/**
 * Single entry point for all log output.
 * Prepares the log line (guards, options, prefix, inspect) then delegates
 * to `emitTTY` or `emitConsole` depending on the environment.
 */
const emit = (
  logLevel: LogLevel,
  args: LogParameters,
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  options?: EmitOptions,
) => {
  try {
    const prepared = prepareLog(logLevel, args, state, self, options);
    if (!prepared) return;

    if (isNodeTTY) {
      emitTTY(prepared, options?.ttySpinner);
    } else {
      emitConsole(prepared);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : JSON.stringify(e));
  }
};

// ── createLogMethod ───────────────────────────────────────────────────────────

/**
 * Builds a bare `LogMethod` for `level` bound to the given logger state.
 * `.spin()` and `.exec()` are attached later by `createSpinMixin`.
 */
function createLogMethod(
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  level: LogLevel,
): LogMethod {
  const fn = (...args: LogParameters) => emit(level, args, state, self);
  return fn as unknown as LogMethod;
}

// ── createCoreLogger ──────────────────────────────────────────────────────────

/**
 * Creates and returns the base logger object shared by all logger types:
 * raw log dispatch, exclusive-mode lock, all level methods, option
 * getters/setters, and the one-shot `.options()` override method.
 *
 * `self` is created internally and captured by all closures — callers receive
 * the same object and can safely extend it with `Object.assign`.
 */
function createCoreLogger(state: LoggerState) {
  // Declared before the object literal so that all closures (log, exclusive,
  // level methods…) capture the variable binding. By the time any method is
  // called, self has been assigned to the object itself.
  let self!: RootLogger | ScopeLogger;

  const base = {
    // ── raw dispatch ──────────────────────────────────────────────────────────
    log(level: LogLevel, ...args: LogParameters) {
      emit(level, args, state, self);
    },
    get exclusive() {
      return registry.exclusive === self;
    },
    set exclusive(b: boolean) {
      registry.exclusive = b ? self : undefined;
    },

    // ── option getters / setters ───────────────────────────────────────────────
    get enabled() {
      return computeOptions(state.options).enabled;
    },
    set enabled(b: boolean) {
      state.options.enabled = b;
    },
    get level() {
      return computeOptions(state.options).level;
    },
    set level(lvl: LogLevel | undefined) {
      state.options.level = lvl;
    },
    get pad() {
      return computeOptions(state.options).pad;
    },
    set pad(b: boolean) {
      state.options.pad = b;
    },
    get color() {
      return computeOptions(state.options).color;
    },
    set color(b: boolean) {
      state.options.color = b;
    },
    get date() {
      return computeOptions(state.options).date;
    },
    set date(b: boolean) {
      state.options.date = b;
    },
    get stack() {
      return computeOptions(state.options).stack;
    },
    set stack(b: boolean) {
      state.options.stack = b;
    },
    get uid() {
      return computeOptions(state.options).uid;
    },
    set uid(b: boolean) {
      state.options.uid = b;
    },
    get inspect() {
      return { ...computeOptions(state.options).inspect };
    },
    set inspect(opts: LoggerOptions['inspect']) {
      state.options.inspect = { ...opts };
    },
  } as Record<string, unknown>;

  self = base as unknown as RootLogger | ScopeLogger;

  // ── level methods ──────────────────────────────────────────────────────────
  for (const level of LogLevels) {
    base[level] = createLogMethod(state, self, level);
  }

  return base;
}

// ── createScopeLogger ─────────────────────────────────────────────────────────

function createScopeLogger(
  scopeName: string,
  options: Partial<LoggerOptions> = {},
): ScopeLogger {
  const state: LoggerState = { options: { ...options }, scope: scopeName };
  const self = createCoreLogger(state) as unknown as ScopeLogger;

  const override = createOverrideMixin(state, self, emit); // options()
  const dispatch: DispatchFn = (level, args, opts) =>
    emit(level, args, state, self, {
      stackOffset: opts?.stackOffset,
      extraPrefixItems: opts?.extraPrefixItems,
      ttySpinner: opts?.ttySpinner,
    });
  const limited = createLimitMixin(dispatch); // limit() / once()
  const spinner = createSpinnerMixin(self, dispatch); // spin() + exec() on each level

  Object.assign(self, override, limited, spinner, { scope: scopeName });

  return self;
}

// ── createRootMixin ───────────────────────────────────────────────────────────

function createRootMixin(self: RootLogger) {
  return {
    scope(
      scopeName: string,
      scopeOptions: Partial<LoggerOptions> = {},
    ): ScopeLogger {
      const existing = registry.scopes[scopeName];
      if (existing) return existing;
      const newScope = createScopeLogger(scopeName, scopeOptions);
      registry.scopes[scopeName] = newScope;
      return newScope;
    },
    bypass(console: Console) {
      activeConsole = console;
    },
    restore() {
      activeConsole = systemConsole;
    },
    patch() {
      console.log = console.info = self.info.bind(self);
      console.info = self.info.bind(self);
      console.debug = self.debug.bind(self);
      console.warn = self.warn.bind(self);
      console.error = self.crit.bind(self);
    },
    unpatch() {
      for (const k of Object.keys(
        __originalConsoleMethods,
      ) as (keyof typeof __originalConsoleMethods)[]) {
        // biome-ignore lint/suspicious/noExplicitAny: console methods share the same shape but TS types diverge
        (console as any)[k] = __originalConsoleMethods[k];
      }
    },
  };
}

// ── createLogger ──────────────────────────────────────────────────────────────

function createLogger(options: Partial<LoggerOptions> = {}): RootLogger {
  const state: LoggerState = { options: { ...options } };
  registry.rootOptions = state.options; // live reference — mutations via setters are visible immediately

  const self = createCoreLogger(state) as unknown as RootLogger;

  const root = createRootMixin(self); // scope() + bypass/restore/patch
  const override = createOverrideMixin(state, self, emit); // options()
  const dispatch: DispatchFn = (level, args, opts) =>
    emit(level, args, state, self, {
      stackOffset: opts?.stackOffset,
      extraPrefixItems: opts?.extraPrefixItems,
      ttySpinner: opts?.ttySpinner,
    });
  const limited = createLimitMixin(dispatch); // limit() / once()
  const spinner = createSpinnerMixin(self, dispatch); // spin() + exec() on each level

  Object.assign(self, root, override, limited, spinner);

  Object.defineProperty(self, 'format', {
    get(): RootLogger['format'] { return registry.format; },
    set(f: RootLogger['format']) { registry.format = f; },
    enumerable: true,
    configurable: true,
  });

  return self;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (!registry.root) {
  registry.root = createLogger();
}

export const Logger: RootLogger = registry.root;
export const L = Logger;

import {
  LEVEL_METHODS as LEVEL_SEVERITY,
  LogLevels,
  TRACE_LEVELS,
} from '../levels';
import { env, isNode, isNodeTTY, utilInspect } from '../utils/env';
import { getCallerStackTrace, getLogCallerInfo } from '../utils/stack';
import { DEFAULT_LOGGER_OPTIONS } from './const';
import type { DispatchFn } from './dispatch';
import { createLimitMixin } from './mixins/limit';
import { createOverrideMixin } from './mixins/override';
import { createSpinnerMixin } from './mixins/spinner';
import { ttyRenderer } from './mixins/spinner/tty/renderer';
import type { Prefix } from './prefix';
import { getPrefix } from './prefix';
import {
  renderBrowserPrefix,
  renderConsolePrefix,
  renderTTYPrefix,
} from './prefix/render';
import { serializeJSON, serializeLogfmt } from './prefix/serialize';
import type {
  LoggerOptions,
  LoggerState,
  LogLevel,
  LogMethod,
  LogParameters,
  RootLogger,
  ScopeLogger,
} from './types';

export { LogLevels } from '../levels';

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

/** The real console captured at module load time — used by restore() and unpatch(). */
const systemConsole = console;

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
const LEVEL_METHODS: {
  [key in LogLevel]: ConsoleFn;
} = {
  emerg: console.error,
  alert: console.error,
  crit: console.error,
  error: console.error,
  warn: console.warn,
  notice: console.info,
  success: console.info,
  info: console.info,
  verb: console.debug,
  debug: console.debug,
  wth: console.debug,
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
    LEVEL_SEVERITY[a] <= LEVEL_SEVERITY[b] ? a : b,
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
  /**
   * Pre-formatted call-site string captured in the main process (worker proxy path).
   * When defined, bypasses worker-side stack introspection entirely:
   * - non-empty string → used as-is.
   * - empty string     → no caller prefix emitted.
   * When undefined, falls back to the normal `stack` flag + getLogCallerInfo().
   */
  callerOverride?: string;
  /**
   * When true, the CallerPrefix built from `callerOverride` is flagged as
   * structuredOnly so pretty renderers skip it. Used for TRACE_LEVELS without
   * stack=true from the worker proxy: JSON/logfmt should record the call-site,
   * but the pretty output already shows a full stack trace below the line.
   */
  callerStructuredOnly?: boolean;
  /**
   * Call-site string for trace-level display only (browser worker path).
   * Never added to the prefix — displayed as a separate line after the log.
   */
  traceCallerOverride?: string;
  /** Unix timestamp (ms) pre-captured in the main process. Forwarded to DatePrefix. */
  ts?: number;
  /** TTY spinner signal: handled before regular line output. */
  ttySpinner?:
    | {
        action: 'register';
        id: symbol;
        frames: string[];
        color?: string;
        progress?: boolean;
      }
    | { action: 'stop'; id: symbol };
};

// ── prepareLog ────────────────────────────────────────────────────────────────

type PreparedLog = {
  prefix: Prefix[];
  color: boolean;
  callArgs: LogParameters;
  /** Whether to emit a stack trace after the log line. */
  trace: boolean;
  /** Whether this level normally carries a trace (for fallback display). */
  hasTrace: boolean;
  method: ConsoleFn;
  /**
   * Browser worker path only: the caller string captured in the main process,
   * to emit as a separate line for levels that normally carry a trace.
   * Undefined in all other contexts.
   */
  traceCaller?: string;
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
  if (!LEVEL_METHODS[logLevel]) return null;

  const resolved = options?.options
    ? computeOptions(options.options, state.options)
    : computeOptions(state.options);
  const { date, level, stack, inspect, uid } = resolved;
  const color = resolved.color;

  if (level && LEVEL_SEVERITY[level] < LEVEL_SEVERITY[logLevel]) return null;

  const prefix: Prefix[] =
    options?.prefix === null
      ? []
      : options?.prefix
        ? (Array.isArray(options.prefix)
            ? options.prefix
            : [options.prefix]
          ).map((p): Prefix => ({ type: 'text', text: p }))
        : getPrefix(logLevel, {
            pad: resolved.pad,
            scope: state.scope,
            channel: LEVEL_METHODS[logLevel].name,
          });

  if (date) prefix.push({ type: 'date', ts: options?.ts });

  if (options?.callerOverride !== undefined) {
    // Call-site was pre-captured in the main process (worker proxy).
    // Use it directly, bypassing worker-side stack introspection.
    if (options.callerOverride) {
      prefix.push({
        type: 'caller',
        value: options.callerOverride,
        structuredOnly: options.callerStructuredOnly,
      });
    }
  } else if (
    (stack || TRACE_LEVELS.has(logLevel)) &&
    options?.stackOffset !== null
  ) {
    const caller = getLogCallerInfo(options?.stackOffset ?? 0);
    if (caller?.fileName) {
      // Always structuredOnly: the caller is rendered as a separate stack trace
      // line (or group in browser), so an inline prefix badge is always redundant.
      prefix.push({
        type: 'caller',
        value: `${caller.fileName}:${caller.lineNumber}:${caller.columnNumber}`,
        structuredOnly: true,
      });
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

  const method = LEVEL_METHODS[logLevel];
  const hasTrace = TRACE_LEVELS.has(logLevel);
  // Emit a stack trace when the level is a trace-level (emerg/alert/crit) or
  // when the user explicitly set stack=true. In worker path, suppress it:
  // callerOverride means the call came via IPC and capturing here would only
  // show IPC handler frames.
  const trace = (hasTrace || stack) && options?.callerOverride === undefined;
  const traceCaller = options?.traceCallerOverride ?? undefined;
  return { prefix, color, callArgs, method, trace, hasTrace, traceCaller };
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

  // Suppress stack trace for json/logfmt formats — consistent with emitConsole's
  // early return for structured formats. The caller info is embedded in the prefix
  // via the structuredOnly field when format is json/logfmt.
  const format = registry.format;
  if (format === 'json' || format === 'logfmt') return;

  if (trace) {
    const stack = getCallerStackTrace();
    if (stack) write(stack);
  } else if (prepared.traceCaller) {
    write(prepared.traceCaller);
  }
}

// ── emitConsole ───────────────────────────────────────────────────────────────

/**
 * Dispatches a log call to the correct console, honouring `bypass()`.
 *
 * Node's global console methods are bound at creation time; `.apply()` cannot
 * redirect their `this` to a different console instance. When `bypass()` is
 * active (`activeConsole !== systemConsole`) we therefore look up the method
 * by name on `activeConsole` directly. When no bypass is active we call the
 * captured method reference directly — this avoids routing through any
 * `console.info = L.info` patches that `L.patch()` may have installed.
 */
function callOnActiveConsole(method: ConsoleFn, args: unknown[]): void {
  if (activeConsole === systemConsole) {
    // No bypass: invoke the captured (bound) method directly so `L.patch()`
    // reassignments on console.info/warn/error do not create an infinite loop.
    method(...(args as Parameters<typeof console.log>));
  } else {
    // Bypassed: route to the custom console by method name so its internal
    // streams receive the output rather than the original bound streams.
    const fn = (activeConsole as unknown as Record<string, unknown>)[
      method.name
    ];
    if (typeof fn === 'function') {
      (fn as (...a: unknown[]) => void).apply(activeConsole, args);
    }
  }
}

/**
 * Writes a prepared log line in non-TTY mode (browser devtools, pipe, CI).
 * Delegates to `activeConsole` via `callOnActiveConsole` so that `bypass()`
 * correctly redirects output even when the captured console methods are bound.
 */
function emitConsole(prepared: PreparedLog): void {
  const { prefix, color, callArgs, method, trace, hasTrace, traceCaller } =
    prepared;
  const format = registry.format;

  if (isNode && (format === 'json' || format === 'logfmt')) {
    const line =
      format === 'json'
        ? serializeJSON(prefix, callArgs)
        : serializeLogfmt(prefix, callArgs);
    // Use callOnActiveConsole so bypass() redirects correctly even though
    // the captured console methods are bound to the global console instance.
    callOnActiveConsole(method, [line]);
    return;
  }

  const prefixArgs = isNode
    ? (() => {
        const s = renderConsolePrefix(prefix);
        return s ? [s] : [];
      })()
    : renderBrowserPrefix(prefix, color);

  // In the browser, only console.debug (Verbose filter) is preserved as-is.
  // All other levels use console.log so DevTools level filters stay meaningful.
  const effectiveMethod =
    !isNode && method !== activeConsole.debug ? activeConsole.log : method;

  if (!isNode) {
    // In the browser, wrap trace-level logs in a collapsed group to avoid the
    // native DevTools stacktrace (which points to internals, not the call-site).
    const stackContent = trace
      ? (getCallerStackTrace() ?? '(no stack available)')
      : (traceCaller ?? (hasTrace ? '(call-site unavailable)' : null));

    if (stackContent !== null) {
      activeConsole.groupCollapsed(...prefixArgs, ...callArgs);
      activeConsole.log(stackContent);
      activeConsole.groupEnd();
    } else {
      effectiveMethod.apply(activeConsole, [...prefixArgs, ...callArgs]);
    }
  } else {
    // Node pretty format: emit normally, then write the stacktrace on stdout.
    callOnActiveConsole(method, [...prefixArgs, ...callArgs]);
    if (trace) {
      const stack = getCallerStackTrace();
      activeConsole.log(stack ?? '(no stack available)');
    } else if (traceCaller) {
      // Worker: emit the call-site captured in the main process.
      activeConsole.log(traceCaller);
    }
  }
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

  // Allows the worker script to dispatch a log line while bypassing the
  // worker-side stack introspection in favour of a call-site string
  // pre-captured in the main process.
  base.__logFromMainProcess = (
    level: LogLevel,
    caller: string | undefined,
    args: unknown[],
    ts?: number,
    traceCaller?: string,
    callerStructuredOnly?: boolean,
  ) => {
    emit(level, args as LogParameters, state, self, {
      callerOverride: caller ?? '',
      ts,
      traceCallerOverride: traceCaller,
      callerStructuredOnly,
    });
  };

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
    get(): RootLogger['format'] {
      return registry.format;
    },
    set(f: RootLogger['format']) {
      registry.format = f;
    },
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

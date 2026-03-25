/**
 * Main-thread proxy for the worker logger.
 *
 * Builds a RootLogger-compatible object whose every method serialises its
 * arguments and posts them to the worker/fork via the appropriate transport.
 * Only public logger types are imported here — no logger internals, no bundle weight.
 *
 * Transport selection:
 *   - Node.js  → child_process.fork() with inherited stdio so the fork owns stdout/TTY.
 *   - Browser  → new Worker() using import.meta.url to locate the bundled script chunk.
 *
 * Asynchronous transport, synchronous API:
 *   The Node transport is created via a dynamic import() — the only ESM-safe way to
 *   load a Node built-in (require() is not available in ESM scope). To keep the public
 *   API fully synchronous (WL is usable immediately after import, no await needed),
 *   messages posted before the transport resolves are buffered in a queue and flushed
 *   in order once the fork/Worker is ready.
 *
 * TTY stdout ownership:
 *   In Node TTY mode the proxy silences the main-thread logger (if already initialised)
 *   after the fork is confirmed ready, so there is no window where neither side writes.
 *   This is done via globalThis duck-typing — no import of the logger bundle.
 */

import type { InspectOptions } from 'node:util';
import { LEVEL_METHODS, LogLevels, TRACE_LEVELS } from '../levels';
import type {
  LoggerOptions,
  LoggerSpinner,
  LogLevel,
  LogMethod,
  LogParameters,
  RootLogger,
  ScopeLogger,
  SpinnerOptions,
  SpinnerUpdateOptions,
} from '../types';
import { getCallerInfoAt, getCallerStackTraceAt } from '../utils/stack';
import { createWorkerLimitMixin } from './limit';
import type { WorkerMessage } from './protocol';

// ── Worker script path ────────────────────────────────────────────────────────

/**
 * Resolves to the worker script path.
 * In production this is replaced at build time by rslib.config.ts `source.define`
 * (e.g. './worker.js'). When running via tsx without a build (dev play scripts),
 * the define is never applied and __WORKER_SCRIPT__ throws a ReferenceError.
 * The typeof guard avoids that: we fall back to the TypeScript source path so
 * tsx can load it directly, inheriting the loader via process.execArgv.
 */
const _workerScriptPath: string =
  // typeof never throws on undeclared identifiers — safe under tsx where the
  // build-time define was never applied.
  typeof __WORKER_SCRIPT__ !== 'undefined' ? __WORKER_SCRIPT__ : './worker.ts'; // dev fallback: tsx runs the TypeScript source directly

// ── Stack capture state ──────────────────────────────────────────────────────

/**
 * Local mirrors of every LoggerOptions flag and RootLogger-specific settings.
 * Kept in sync by the option setters so that activateFallback() can replay
 * the exact configuration onto the fallback Logger after terminateWorker().
 *
 * Defaults match DEFAULT_LOGGER_OPTIONS / RootLogger initial values.
 * Module-level: safe because the proxy is a singleton.
 */
let _captureStack = false;
let _enabled = true;
let _level: LogLevel | undefined;
let _pad = true;
let _color = true;
let _date = false;
let _uid = false;
let _inspect: InspectOptions = {};
let _format: RootLogger['format'] = 'json';
let _exclusive = false;

/**
 * Terminate callback set once the transport is ready.
 * Called by terminateWorker() — null before the fork/Worker is alive or
 * after termination.
 */
let _terminateTransport: (() => void) | null = null;

/**
 * Stops the underlying worker/fork and activates the fallback logger.
 * Must be called at most once — subsequent calls are no-ops.
 * After this point WL continues to operate via the main-thread logger (L).
 * There is no way to return to worker mode.
 */
export function terminateWorker(): void {
  _terminateTransport?.();
  _terminateTransport = null;
  activateFallback();
}

/**
 * Formats a parsed caller info object into the same string representation
 * used by prepareLog in the logger internals.
 */
function formatCallerString(
  info: NonNullable<ReturnType<typeof getCallerInfoAt>>,
): string {
  // Omit the function name entirely — it is engine-dependent and changes under
  // minification or anonymous closures, making it an unreliable prefix.
  // file:line:col is the only stable, copy-pasteable reference across all
  // environments (Node, browser, tsx dev mode).
  return `${info.fileName}:${info.lineNumber}:${info.columnNumber}`;
}

// ── Transport abstraction ─────────────────────────────────────────────────────

type Transport = {
  send(msg: WorkerMessage): void;
  terminate(): void;
};

/**
 * Internal send function passed through to scope proxies and spinner handles.
 * Abstracts over the queue-vs-live-transport distinction so child objects
 * never need to know about the async initialisation lifecycle.
 */
type SendFn = (msg: WorkerMessage) => void;

/**
 * When non-null, all send() calls are routed here instead of the worker
 * transport. Set by activateFallback() after terminateWorker() — one-way
 * transition: there is no going back to worker mode once this is set.
 */
let _fallbackSend: SendFn | null = null;

// ── Null console — used to silence the main-thread logger in TTY mode ─────────

/**
 * A Proxy over the real console that swallows every method call.
 * Passed to Logger.bypass() so the main-thread logger stops writing to stdout
 * while the fork is the exclusive owner.
 */
const nullConsole = new Proxy(console, {
  get: () => () => {},
}) as unknown as Console;

// ── Original console methods (patch / unpatch) ────────────────────────────────

/**
 * Captured at module load time, before any patching, so unpatch() can always
 * restore the originals regardless of how many times patch() has been called.
 * Bound to console to remain callable even if the console object is replaced.
 */
const __originalConsoleMethods = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
} as const;

// ── Serialisation helpers ─────────────────────────────────────────────────────

/**
 * Safely clones a single argument for IPC / MessageChannel transfer.
 * structuredClone handles most values natively (objects, arrays, typed arrays,
 * Date, Map, Set, Error, …). Falls back to String() for non-cloneable values
 * such as functions or circular references — we prefer a degraded representation
 * over a thrown error that would silently drop the entire log message.
 */
function cloneArg(arg: unknown): unknown {
  try {
    return structuredClone(arg);
  } catch {
    try {
      return String(arg);
    } catch {
      return '[unserializable]';
    }
  }
}

function cloneArgs(args: LogParameters): unknown[] {
  return args.map(cloneArg);
}

// ── ID generator for spinner correlation ─────────────────────────────────────

/**
 * Each spinner started on the proxy side gets a unique string ID.
 * The same ID is used in all subsequent spin:update / spin:success / spin:fail
 * messages so the worker script can route them to the correct spinner handle.
 */
let _spinnerSeq = 0;
function nextSpinnerId(): string {
  return `ws-${++_spinnerSeq}`;
}

// ── Node transport (async, ESM-safe) ──────────────────────────────────────────

/**
 * Creates the Node transport by forking a child process.
 *
 * Why async / dynamic import:
 *   require() is not defined in ESM module scope. A static top-level import of
 *   'child_process' would cause bundlers (Rspack, Webpack) to attempt to bundle
 *   the Node built-in and fail in browser builds. A dynamic import() is
 *   tree-shaken correctly — bundlers mark 'child_process' as external in Node
 *   targets and as dead code in browser targets.
 *
 * Why fork() instead of worker_threads:
 *   worker_threads do not inherit the parent's stdout file descriptor — process.stdout
 *   inside a worker thread is not a TTY even when the parent's is. fork() with
 *   stdio: ['inherit', 'inherit', 'inherit', 'ipc'] passes the exact same fd to the
 *   child, so isTTY is true and the VT100 spinner renderer works as expected.
 */
async function createNodeTransport(): Promise<Transport> {
  const { fork } = await import('node:child_process');
  // Dynamic imports of Node built-ins keep browser bundlers from treating them
  // as dependencies. path/url are only reached in Node context.
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  // Resolve the worker script to an absolute path without new URL(variable)
  // — Rspack/Webpack flag dynamic new URL() arguments as a critical dependency
  // warning because they cannot statically determine which file to bundle.
  // Using path.resolve avoids that while still working for both './worker.js'
  // (production build) and './worker.ts' (tsx dev mode).
  const dir = dirname(fileURLToPath(import.meta.url));
  const scriptPath = resolve(dir, _workerScriptPath);

  // When running a .ts source file (dev mode via tsx), pass the parent's execArgv
  // so the forked child inherits the tsx loader and can execute TypeScript directly.
  const execArgv = _workerScriptPath.endsWith('.ts')
    ? process.execArgv
    : undefined;

  const child = fork(scriptPath, [], {
    // Pass the same stdin/stdout file descriptors to the child so it becomes
    // the sole owner of the TTY. Stderr is piped (not inherited) so any
    // accidental worker stderr does not bleed into the parent terminal or test
    // output. IPC is added as fd[3].
    stdio: ['inherit', 'inherit', 'pipe', 'ipc'],
    execArgv,
  });

  child.on('error', (err) => {
    console.error('[WorkerLogger] Fork error:', err.message);
  });

  return {
    send: (msg) => {
      child.send(msg);
    },
    terminate: () => {
      child.kill();
    },
  };
}

// ── Browser transport (Web Worker) ────────────────────────────────────────────

/**
 * Creates the browser transport synchronously.
 * The Worker constructor is non-blocking — the worker script is loaded in a
 * separate thread and the MessageChannel is ready essentially immediately.
 * Wrapped in Promise.resolve() at the call site for a uniform async interface.
 */
function createBrowserTransport(): Transport {
  // new URL('./worker.ts', import.meta.url) is a static literal that Rspack can
  // analyse at build time to locate and bundle the worker chunk. The emitted URL
  // is automatically rewritten to point at the built asset (e.g. './worker.js').
  // Using a variable here would produce a "critical dependency" warning because
  // Rspack cannot statically resolve arbitrary expressions inside new URL().
  const worker = new Worker(
    new URL(/* webpackChunkName: "worker" */ './worker.ts', import.meta.url),
    { type: 'module' },
  );

  return {
    send: (msg) => {
      worker.postMessage(msg);
    },
    terminate: () => {
      worker.terminate();
    },
  };
}

// ── Environment detection (mirrors utils/env.ts without importing it) ────────

/**
 * Mirrors the isNode / isNodeTTY checks from utils/env.ts.
 * Duplicated here intentionally — importing env.ts would pull the entire logger
 * bundle into the proxy, defeating the purpose of the separate entry point.
 */
const _isNode =
  typeof process !== 'undefined' && process?.versions?.node != null;

const _isNodeTTY =
  _isNode &&
  process.env['LLOGER_FORCE_CONSOLE'] !== 'true' &&
  !!process.stdout?.isTTY;

// ── Silence main-thread logger via globalThis duck-typing ────────────────────

/**
 * If the main-thread logger (L / Logger) has already been initialised, redirect
 * its output to the null console so it stops writing directly to stdout.
 *
 * Why globalThis duck-typing instead of importing Logger.bypass():
 *   Importing @lalex/console would load the full logger bundle (44 kB) on the
 *   main thread — exactly what using a worker is meant to avoid. The registry
 *   is always stored on globalThis['$logger-registry'] by design (to survive
 *   CJS+ESM dual-load), so we can access it without any import.
 *
 * Only called in Node TTY mode — in non-TTY and browser contexts the two loggers
 * can coexist without visual corruption (no VT100 cursor sequences in play).
 *
 * Called after the transport is confirmed ready so there is no window where
 * neither logger writes to stdout.
 */
function silenceMainLogger(): void {
  if (!_isNodeTTY) return;
  const reg = (globalThis as Record<string, unknown>)['$logger-registry'] as
    | { root?: { bypass(c: Console): void } }
    | undefined;
  reg?.root?.bypass(nullConsole);
}

/**
 * Reverses silenceMainLogger — restores the main-thread logger to its original
 * stdout output. Called by terminate() so the app can keep logging after the
 * worker is shut down.
 */
function restoreMainLogger(): void {
  if (!_isNodeTTY) return;
  const reg = (globalThis as Record<string, unknown>)['$logger-registry'] as
    | { root?: { restore(): void } }
    | undefined;
  reg?.root?.restore();
}

// ── Fallback logger (post-terminateWorker) ────────────────────────────────────

/**
 * Interprets a WorkerMessage and delegates it to a live RootLogger instance.
 * Used after terminateWorker() so WL continues to work without the fork.
 *
 * @param root - The main-thread logger to delegate to.
 * @returns A SendFn that routes WorkerMessages to `root`.
 */
function buildFallbackSend(root: RootLogger): SendFn {
  // Tracks active spinners created via spin:start, keyed by correlation ID.
  const spinners = new Map<string, LoggerSpinner>();

  return (msg: WorkerMessage) => {
    switch (msg.type) {
      case 'log': {
        const target = msg.scope
          ? root.scope(msg.scope.name, msg.scope.options)
          : root;
        if (msg.caller !== undefined) {
          target.__logFromMainProcess(
            msg.level,
            msg.caller,
            msg.args,
            msg.ts,
            msg.traceCaller,
            msg.callerStructuredOnly,
          );
        } else {
          // biome-ignore lint/suspicious/noExplicitAny: level methods share the same shape
          (target as any)[msg.level](...msg.args);
        }
        break;
      }
      case 'spin:start': {
        const target = msg.scope
          ? root.scope(msg.scope.name, msg.scope.options)
          : root;
        // biome-ignore lint/suspicious/noExplicitAny: level methods share the same shape
        const spinFn = ((target as any)[msg.level] as LogMethod | undefined)
          ?.spin;
        if (spinFn) {
          const handle = spinFn(msg.message, msg.options ?? {});
          handle.start();
          spinners.set(msg.id, handle);
        }
        break;
      }
      case 'spin:update': {
        spinners.get(msg.id)?.update(msg.text, msg.options);
        break;
      }
      case 'spin:success': {
        const s = spinners.get(msg.id);
        s?.success(msg.text, msg.options);
        spinners.delete(msg.id);
        break;
      }
      case 'spin:fail': {
        const s = spinners.get(msg.id);
        s?.fail(msg.text, msg.options);
        spinners.delete(msg.id);
        break;
      }
      case 'spin:stop': {
        const s = spinners.get(msg.id);
        s?.stop();
        spinners.delete(msg.id);
        break;
      }
      case 'opt:set': {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic property assignment on RootLogger
        (root as any)[msg.key] = msg.value;
        break;
      }
      case 'opt:format': {
        root.format = msg.value;
        break;
      }
      case 'opt:exclusive': {
        root.exclusive = msg.value;
        break;
      }
    }
  };
}

/**
 * Activates the fallback logger after terminateWorker().
 *
 * Path A (common): L is already in the globalThis registry (app also imports L).
 *   Uses it directly — no dynamic import, no loader code in this bundle.
 *
 * Path B (rare): L has never been loaded.
 *   Dynamically imports the logger. Messages sent during the async load are
 *   buffered and drained once L initialises. The import only executes after
 *   terminateWorker() is called, so no logger code is loaded in normal operation.
 */
function activateFallback(): void {
  const reg = (globalThis as Record<string, unknown>)['$logger-registry'] as
    | { root?: RootLogger }
    | undefined;

  if (reg?.root) {
    // Path A — L is ready, connect immediately.
    restoreMainLogger();
    const root = reg.root;
    root.stack = _captureStack;
    root.enabled = _enabled;
    root.level = _level;
    root.pad = _pad;
    root.color = _color;
    root.date = _date;
    root.uid = _uid;
    root.inspect = _inspect;
    root.format = _format;
    root.exclusive = _exclusive;
    _fallbackSend = buildFallbackSend(root);
    return;
  }

  // Path B — L not yet loaded: buffer messages during the dynamic import.
  const pending: WorkerMessage[] = [];
  _fallbackSend = (msg) => {
    pending.push(msg);
  };

  import(/* webpackChunkName: "fallback-logger" */ '../logger')
    .then(({ Logger }) => {
      Logger.stack = _captureStack;
      Logger.enabled = _enabled;
      Logger.level = _level;
      Logger.pad = _pad;
      Logger.color = _color;
      Logger.date = _date;
      Logger.uid = _uid;
      Logger.inspect = _inspect;
      Logger.format = _format;
      Logger.exclusive = _exclusive;
      _fallbackSend = buildFallbackSend(Logger);
      for (const msg of pending) (_fallbackSend as SendFn)(msg);
    })
    .catch((e: unknown) => {
      console.error(
        '[WorkerLogger] Failed to load fallback logger:',
        e instanceof Error ? e.message : String(e),
      );
      _fallbackSend = null;
    });
}

// ── WorkerScopeLogger proxy ───────────────────────────────────────────────────

/**
 * Lightweight scope proxy — prefixes every message with a scope name and
 * forwards it to the shared send function. Does not need the full logger
 * machinery; option setters are stubs since scope options are not forwarded
 * (configure the root WorkerLogger instead).
 */
function createWorkerScopeProxy(
  scopeName: string,
  scopeOptions: Partial<LoggerOptions>,
  send: SendFn,
): ScopeLogger {
  const scope = { name: scopeName, options: scopeOptions };
  // Severity threshold derived from scopeOptions.level — undefined means no filter.
  const scopeSeverity =
    scopeOptions.level !== undefined
      ? LEVEL_METHODS[scopeOptions.level]
      : undefined;
  const base: Record<string, unknown> = { scope: scopeName };

  for (const level of LogLevels) {
    const fn = (...args: LogParameters) => {
      if (scopeSeverity !== undefined && LEVEL_METHODS[level] > scopeSeverity)
        return;
      const isTrace = TRACE_LEVELS.has(level);
      // Capture call-site when stack=true OR for error-class levels (emerg/alert/crit).
      // The callerStructuredOnly flag hides it from pretty renderers while keeping
      // it in JSON/logfmt output, where it is always useful regardless of stack flag.
      const callerInfo =
        _captureStack || isTrace ? getCallerInfoAt(4) : undefined;
      const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
      const callerStructuredOnly = isTrace && !_captureStack;
      // Capture the full user stack so the worker can show it in pretty mode,
      // mirroring what L does via getCallerStackTrace() from within emitTTY/emitConsole.
      const traceCaller = isTrace ? getCallerStackTraceAt(4) : undefined;
      send({
        type: 'log',
        level,
        scope,
        args: cloneArgs(args),
        caller,
        callerStructuredOnly,
        traceCaller,
        ts: Date.now(),
      });
    };

    const spinFn: LogMethod['spin'] = (
      message: string,
      options: Omit<SpinnerOptions, 'text'> = {},
    ): LoggerSpinner => {
      const id = nextSpinnerId();
      send({ type: 'spin:start', id, level, scope, message, options });
      return buildSpinnerHandle(id, send);
    };

    Object.assign(fn, { spin: spinFn, exec: makeExecFn(spinFn) });
    base[level] = fn;
  }

  base['log'] = (level: LogLevel, ...args: LogParameters) => {
    if (scopeSeverity !== undefined && LEVEL_METHODS[level] > scopeSeverity)
      return;
    const isTrace = TRACE_LEVELS.has(level);
    const callerInfo =
      _captureStack || isTrace ? getCallerInfoAt(4) : undefined;
    const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
    const callerStructuredOnly = isTrace && !_captureStack;
    const traceCaller = isTrace ? getCallerStackTraceAt(4) : undefined;
    send({
      type: 'log',
      level,
      scope,
      args: cloneArgs(args),
      caller,
      callerStructuredOnly,
      traceCaller,
      ts: Date.now(),
    });
  };

  // Stub option accessors — scoped loggers don't expose option setters in this proxy.
  // Options are controlled on the root WorkerLogger instead.
  for (const key of [
    'enabled',
    'level',
    'pad',
    'color',
    'date',
    'stack',
    'uid',
    'inspect',
    'exclusive',
  ] as const) {
    Object.defineProperty(base, key, {
      get: () => undefined,
      set: () => {},
      enumerable: true,
      configurable: true,
    });
  }

  stubUnusedMethods(base);

  const { once, limit } = createWorkerLimitMixin(
    send,
    () => _captureStack,
    scopeName,
  );
  base['once'] = once;
  base['limit'] = limit;

  return base as unknown as ScopeLogger;
}

// ── Spinner handle builder ────────────────────────────────────────────────────

/**
 * Returns a LoggerSpinner whose lifecycle methods post the corresponding
 * protocol messages via send. The spinner itself lives in the worker script —
 * this handle is just a thin IPC remote control.
 *
 * Note: start() is a no-op because spin:start in the worker already calls
 * spinner.start() immediately on receipt. The handle's start() exists only
 * to satisfy the LoggerSpinner interface.
 */
function buildSpinnerHandle(id: string, send: SendFn): LoggerSpinner {
  const spinner: LoggerSpinner = {
    start() {
      return spinner;
    },
    update(text: string, options?: SpinnerUpdateOptions) {
      send({ type: 'spin:update', id, text, options });
    },
    success(text?: string, options?: SpinnerUpdateOptions) {
      send({ type: 'spin:success', id, text, options });
    },
    fail(text?: string, options?: SpinnerUpdateOptions) {
      send({ type: 'spin:fail', id, text, options });
    },
    stop() {
      send({ type: 'spin:stop', id });
    },
  };
  return spinner;
}

// ── exec helper (mirrors makeExecFn from spinner mixin) ───────────────────────

function makeExecFn(spinFn: LogMethod['spin']): LogMethod['exec'] {
  return async <T>(
    promiseOrFactory: Promise<T> | (() => Promise<T>),
    options?: { label?: string },
  ): Promise<T> => {
    const label = options?.label ?? 'Exec';
    const factory =
      typeof promiseOrFactory === 'function'
        ? promiseOrFactory
        : () => promiseOrFactory;
    const spinner = spinFn(label, { duration: true });
    spinner.start();
    try {
      const result = await factory();
      spinner.success(label);
      return result;
    } catch (e) {
      spinner.fail(e instanceof Error ? `${label}: ${e.message}` : label);
      throw e;
    }
  };
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

/** Adds no-op stubs for methods that are irrelevant on the proxy side. */
function stubUnusedMethods(base: Record<string, unknown>): void {
  base['options'] = () => base;
  // __logFromMainProcess is called by the worker script on the real Logger —
  // the proxy never receives such calls, but the type requires the method.
  base['__logFromMainProcess'] = () => {};
}

// ── createWorkerProxy ─────────────────────────────────────────────────────────

/**
 * Builds the singleton WorkerLogger proxy.
 * Called once at module initialisation — not exported.
 *
 * The returned object is immediately usable: all methods are synchronous and
 * buffer their messages until the underlying transport is ready.
 */
function createWorkerProxy(): RootLogger {
  /**
   * Message queue — buffers all messages posted before the transport is ready.
   *
   * The Node transport requires an async import() to load child_process in ESM
   * scope. During the ~30–80ms startup window (fork + module load in the child),
   * any log call from application bootstrap code lands here instead of being
   * dropped. Once the transport resolves the queue is drained in order.
   *
   * For the browser, Worker construction is synchronous, so this queue is
   * drained on the next microtask — the delay is imperceptible (< 1ms).
   */
  const queue: WorkerMessage[] = [];
  let resolvedTransport: Transport | null = null;

  /**
   * The central send function used by all level methods, scope proxies, and
   * spinner handles. Switches automatically between queuing and live dispatch
   * as soon as the transport resolves — callers are unaware of the transition.
   */
  const send: SendFn = (msg) => {
    // After terminateWorker(), route all messages through the fallback logger.
    if (_fallbackSend) {
      _fallbackSend(msg);
      return;
    }
    // Short-circuit before any IPC when logging is disabled on the proxy side.
    if (!_enabled) return;
    if (resolvedTransport) {
      resolvedTransport.send(msg);
    } else {
      queue.push(msg);
    }
  };

  // Kick off transport creation. Both paths resolve to the same Transport shape.
  // The browser path uses Promise.resolve() for a uniform async interface even
  // though Worker construction itself is synchronous.
  const transportPromise: Promise<Transport> = _isNode
    ? createNodeTransport()
    : Promise.resolve(createBrowserTransport());

  transportPromise
    .then((transport) => {
      resolvedTransport = transport;
      // Drain queued messages before any future send() calls land.
      for (const msg of queue) transport.send(msg);
      queue.length = 0;
      // Silence the main-thread logger only after the fork is confirmed alive,
      // so there is no window where neither logger produces output on stdout.
      silenceMainLogger();
    })
    .catch((e) => {
      console.error(
        '[WorkerLogger] Failed to initialise transport:',
        e instanceof Error ? e.message : String(e),
      );
    });

  // Scope cache — mirrors the registry.scopes pattern in the main logger.
  const scopes = new Map<string, ScopeLogger>();

  const base: Record<string, unknown> = {};

  // ── level methods ────────────────────────────────────────────────────────────
  for (const level of LogLevels) {
    const fn = (...args: LogParameters) => {
      const isTrace = TRACE_LEVELS.has(level);
      // Capture call-site when stack=true OR for error-class levels (emerg/alert/crit).
      // The callerStructuredOnly flag hides it from pretty renderers while keeping
      // it in JSON/logfmt output, where it is always useful regardless of stack flag.
      const callerInfo =
        _captureStack || isTrace ? getCallerInfoAt(4) : undefined;
      const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
      const callerStructuredOnly = isTrace && !_captureStack;
      // Capture the full user stack so the worker can show it in pretty mode,
      // mirroring what L does via getCallerStackTrace() from within emitTTY/emitConsole.
      const traceCaller = isTrace ? getCallerStackTraceAt(4) : undefined;
      send({
        type: 'log',
        level,
        args: cloneArgs(args),
        caller,
        callerStructuredOnly,
        traceCaller,
        ts: Date.now(),
      });
    };

    const spinFn: LogMethod['spin'] = (
      message: string,
      options: Omit<SpinnerOptions, 'text'> = {},
    ): LoggerSpinner => {
      const id = nextSpinnerId();
      send({ type: 'spin:start', id, level, message, options });
      return buildSpinnerHandle(id, send);
    };

    Object.assign(fn, { spin: spinFn, exec: makeExecFn(spinFn) });
    base[level] = fn;
  }

  // ── raw log dispatch ─────────────────────────────────────────────────────────
  base['log'] = (level: LogLevel, ...args: LogParameters) => {
    const isTrace = TRACE_LEVELS.has(level);
    const callerInfo =
      _captureStack || isTrace ? getCallerInfoAt(4) : undefined;
    const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
    const callerStructuredOnly = isTrace && !_captureStack;
    const traceCaller = isTrace ? getCallerStackTraceAt(4) : undefined;
    send({
      type: 'log',
      level,
      args: cloneArgs(args),
      caller,
      callerStructuredOnly,
      traceCaller,
      ts: Date.now(),
    });
  };

  // ── scope() ──────────────────────────────────────────────────────────────────
  base['scope'] = (
    scopeName: string,
    scopeOptions: Partial<LoggerOptions> = {},
  ): ScopeLogger => {
    const existing = scopes.get(scopeName);
    if (existing) return existing;
    // Pass the shared send function — the scope proxy is unaware of the queue.
    const proxy = createWorkerScopeProxy(scopeName, scopeOptions, send);
    scopes.set(scopeName, proxy);
    return proxy;
  };

  // ── option setters — forwarded to the worker via opt:set messages ─────────────
  const optKeys: (keyof LoggerOptions)[] = [
    'enabled',
    'level',
    'pad',
    'color',
    'date',
    'stack',
    'uid',
    'inspect',
  ];

  for (const key of optKeys) {
    Object.defineProperty(base, key, {
      // Reads are not meaningful on the proxy side — the source of truth lives
      // in the worker. Returning undefined avoids misleading stale values.
      get: () => undefined,
      set: (value: unknown) => {
        // Mirror flags locally so activateFallback() can replay them.
        if (key === 'stack') _captureStack = value === true;
        if (key === 'enabled') _enabled = value !== false;
        if (key === 'level') _level = value as LogLevel | undefined;
        if (key === 'pad') _pad = value === true;
        if (key === 'color') _color = value !== false;
        if (key === 'date') _date = value === true;
        if (key === 'uid') _uid = value === true;
        if (key === 'inspect') _inspect = value as InspectOptions;
        send({ type: 'opt:set', key, value });
      },
      enumerable: true,
      configurable: true,
    });
  }

  Object.defineProperty(base, 'format', {
    get: () => undefined,
    set: (value: RootLogger['format']) => {
      _format = value;
      send({ type: 'opt:format', value });
    },
    enumerable: true,
    configurable: true,
  });

  Object.defineProperty(base, 'exclusive', {
    get: () => false,
    set: (value: boolean) => {
      _exclusive = value;
      send({ type: 'opt:exclusive', value });
    },
    enumerable: true,
    configurable: true,
  });

  // bypass/restore have no meaning on the proxy — all output is produced inside the fork/Worker.
  base['bypass'] = () => {};
  base['restore'] = () => {};

  /**
   * Monkey-patches the global console methods to route through the worker.
   * console.log / console.info → 'info', console.debug → 'debug',
   * console.warn → 'warn', console.error → 'crit'.
   * Call unpatch() to restore the originals.
   */
  base['patch'] = () => {
    const infoFn = (...args: unknown[]) =>
      send({
        type: 'log',
        level: 'info',
        args: cloneArgs(args as LogParameters),
        ts: Date.now(),
      });
    console.log = infoFn;
    console.info = infoFn;
    console.debug = (...args: unknown[]) =>
      send({
        type: 'log',
        level: 'debug',
        args: cloneArgs(args as LogParameters),
        ts: Date.now(),
      });
    console.warn = (...args: unknown[]) =>
      send({
        type: 'log',
        level: 'warn',
        args: cloneArgs(args as LogParameters),
        ts: Date.now(),
      });
    console.error = (...args: unknown[]) =>
      send({
        type: 'log',
        level: 'crit',
        args: cloneArgs(args as LogParameters),
        ts: Date.now(),
      });
  };

  /** Restores the console methods that were replaced by patch(). */
  base['unpatch'] = () => {
    for (const k of Object.keys(
      __originalConsoleMethods,
    ) as (keyof typeof __originalConsoleMethods)[]) {
      // biome-ignore lint/suspicious/noExplicitAny: console methods share the same shape but TS types diverge
      (console as any)[k] = __originalConsoleMethods[k];
    }
  };
  stubUnusedMethods(base);

  const { once, limit } = createWorkerLimitMixin(send, () => _captureStack);
  base['once'] = once;
  base['limit'] = limit;

  return base as unknown as RootLogger;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Singleton proxy stored on globalThis under a dedicated key so that multiple
 * copies of this module (CJS+ESM dual-load, duplicate packages in node_modules)
 * all share the same underlying worker instance and message queue.
 */
const WORKER_REGISTRY_KEY = '$worker-logger-registry';
const anyGlobal = globalThis as Record<string, unknown>;

if (!anyGlobal[WORKER_REGISTRY_KEY]) {
  anyGlobal[WORKER_REGISTRY_KEY] = createWorkerProxy();
}

export const workerLoggerSingleton = anyGlobal[
  WORKER_REGISTRY_KEY
] as RootLogger;

export { workerLoggerSingleton as WorkerLogger, workerLoggerSingleton as WL };

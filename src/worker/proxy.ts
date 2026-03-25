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
import type { WorkerMessage } from './protocol';

// ── Stack capture state ──────────────────────────────────────────────────────

/**
 * Mirrors the worker's `stack` option so the proxy can decide whether to
 * capture the call-site before sending each log message. Updated in the
 * opt:set setter whenever `key === 'stack'`.
 *
 * Module-level: safe because the proxy is a singleton.
 */
let _captureStack = false;

/**
 * Mirrors the worker's `enabled` option so the proxy can skip IPC entirely
 * when logging is disabled. Defaults to true (same as LoggerOptions default).
 * Updated in the opt:set setter whenever `key === 'enabled'`.
 */
let _enabled = true;

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
 * Formats a parsed caller info object into a "filePath:line:col" string,
 * matching the format used by prepareLog in the logger internals.
 */
function formatCallerString(
  info: NonNullable<ReturnType<typeof getCallerInfoAt>>,
): string {
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
    // Fast path: structuredClone handles objects, arrays, Date, Map, Set, Error,
    // RegExp, typed arrays and most other built-in types without allocating a
    // JSON string — no precision loss, no prototype stripping.
    return structuredClone(arg);
  } catch {
    try {
      // Fallback for non-cloneable values: functions, symbols, class instances
      // with non-transferable state, or objects with circular references.
      // String() is lossy but keeps the log line intact rather than dropping
      // the argument entirely.
      return String(arg);
    } catch {
      // Last resort: String() itself threw — exotic Proxy objects can do this.
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

  // new URL('./script.js', import.meta.url) is the standard pattern that Rspack,
  // Webpack 5, and Vite all recognise as a chunk-split boundary — the script is
  // emitted as a separate file and the URL resolves correctly at runtime.
  const scriptUrl = new URL('./script.js', import.meta.url);

  const child = fork(scriptUrl.pathname, [], {
    // stdio[0..2] = inherit: the child shares the exact same fd numbers as the
    // parent for stdin, stdout, and stderr. This means process.stdout.isTTY is
    // true inside the child when the parent runs in a terminal — a prerequisite
    // for the VT100 spinner renderer. stdio[3] = 'ipc': adds the hidden IPC
    // channel that enables child.send() / process.on('message').
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  child.on('error', (err) => {
    // Surface fork errors (e.g. ENOENT if the script path is wrong) without
    // crashing the main process — the queue will simply drain to a dead channel.
    console.error('[WorkerLogger] Fork error:', err.message);
  });

  return {
    // child.send() serialises via Node's built-in IPC serialisation (same
    // algorithm as structuredClone). Delivery is async and FIFO-ordered.
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
  // The webpackChunkName magic comment instructs Rspack/Webpack to name the
  // generated worker chunk "console-worker" instead of a numeric hash.
  const worker = new Worker(
    new URL(
      /* webpackChunkName: "console-worker" */ './script.js',
      import.meta.url,
    ),
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
        // Re-create the scope with its original options so that level filtering
        // and scope name are consistent with the pre-terminate worker output.
        const target = msg.scope
          ? root.scope(msg.scope.name, msg.scope.options)
          : root;
        if (msg.key !== undefined) {
          // Rate-limited call: delegate to Logger.once / Logger.limit.
          const limited =
            (msg.max ?? 1) > 1
              ? target.limit(msg.max as number, msg.key)
              : target.once(msg.key);
          limited[msg.level](...(msg.args as Parameters<typeof console.log>));
        } else {
          // Always go through __logFromMainProcess to avoid spurious stack introspection
          // and to forward the traceCaller string for TRACE_LEVELS display.
          target.__logFromMainProcess(
            msg.level,
            msg.caller,
            msg.args,
            msg.ts,
            msg.traceCaller,
          );
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
    // Path A — L is already initialised in this process. Use it directly without
    // any dynamic import. Restoring the main logger first ensures stdout is
    // unsilenced before the first fallback message is written, eliminating any
    // gap in output.
    restoreMainLogger();
    const root = reg.root;
    root.stack = _captureStack;
    root.enabled = _enabled;
    _fallbackSend = buildFallbackSend(root);
    return;
  }

  // Path B — L was never imported in this process (worker-only app). Install a
  // temporary buffer so no messages are lost while the dynamic import resolves,
  // then drain it in order once the logger is ready.
  const pending: WorkerMessage[] = [];
  _fallbackSend = (msg) => {
    pending.push(msg);
  };

  import(/* webpackChunkName: "fallback-logger" */ '../logger')
    .then(({ Logger }) => {
      Logger.stack = _captureStack;
      Logger.enabled = _enabled;
      // Replace the buffer with the live send function, then replay buffered msgs.
      _fallbackSend = buildFallbackSend(Logger);
      for (const msg of pending) (_fallbackSend as SendFn)(msg);
    })
    .catch((e: unknown) => {
      console.error(
        '[WorkerLogger] Failed to load fallback logger:',
        e instanceof Error ? e.message : String(e),
      );
      // Null out the send function so further calls are silently dropped rather
      // than buffered indefinitely in the now-unreachable pending array.
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
  // Bundle name + options into a single object so the worker can re-create the
  // scope with identical settings (level filter, etc.) on its side.
  const scope = { name: scopeName, options: scopeOptions };

  // Pre-compute the numeric severity threshold from the scope-level option so
  // each log call only does a cheap integer comparison rather than a string lookup.
  // undefined means no filter — all levels are forwarded.
  const scopeSeverity =
    scopeOptions.level !== undefined
      ? LEVEL_METHODS[scopeOptions.level]
      : undefined;

  const base: Record<string, unknown> = { scope: scopeName };

  for (const level of LogLevels) {
    const fn = (...args: LogParameters) => {
      // Drop messages below the scope threshold without touching the IPC pipe.
      // This mirrors the filtering the real Logger does inside the worker, but
      // avoids the serialisation overhead for calls that would be discarded anyway.
      if (scopeSeverity !== undefined && LEVEL_METHODS[level] > scopeSeverity)
        return;
      const callerInfo = _captureStack ? getCallerInfoAt(4) : undefined;
      const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
      const traceCaller = TRACE_LEVELS.has(level)
        ? getCallerStackTraceAt(4)
        : undefined;
      send({
        type: 'log',
        level,
        scope,
        args: cloneArgs(args),
        caller,
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
    const callerInfo = _captureStack ? getCallerInfoAt(4) : undefined;
    const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
    const traceCaller = TRACE_LEVELS.has(level)
      ? getCallerStackTraceAt(4)
      : undefined;
    send({
      type: 'log',
      level,
      scope,
      args: cloneArgs(args),
      caller,
      traceCaller,
      ts: Date.now(),
    });
  };

  // Scope option setters are intentionally inert on the proxy side.
  // All option changes must go through the root WorkerLogger (opt:set messages)
  // so the worker remains the single source of truth for configuration.
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

/**
 * Adds no-op stubs for methods that are irrelevant on the proxy side.
 *
 * - once / limit: rate-limiting is handled inside the worker. The proxy sends
 *   the key + max in the protocol message; the stubs here exist only to satisfy
 *   the TypeScript interface shape.
 * - options: one-shot option overrides are not supported on the proxy (the
 *   worker owns the option state). Returning `base` keeps call-site code valid.
 * - __logFromMainProcess: called on the real Logger by the worker script to
 *   forward the pre-captured call-site string. The proxy never receives it, but
 *   the RootLogger type contract requires the method to exist.
 */
function stubUnusedMethods(base: Record<string, unknown>): void {
  base['once'] = () => base;
  base['limit'] = () => base;
  base['options'] = () => base;
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
    // After terminateWorker() the fallback is active — bypass the transport
    // entirely and delegate directly to the main-thread logger.
    if (_fallbackSend) {
      _fallbackSend(msg);
      return;
    }
    // Honour the enabled flag without paying for IPC serialisation. The mirror
    // variable is updated synchronously by the opt:set setter.
    if (!_enabled) return;
    if (resolvedTransport) {
      // Happy path: fork/Worker is alive. Send immediately over IPC / MessageChannel.
      resolvedTransport.send(msg);
    } else {
      // Transport still initialising (async fork / microtask Worker): buffer the
      // message so it is delivered in order once the transport resolves.
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
      const callerInfo = _captureStack ? getCallerInfoAt(4) : undefined;
      const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
      const traceCaller = TRACE_LEVELS.has(level)
        ? getCallerStackTraceAt(4)
        : undefined;
      send({
        type: 'log',
        level,
        args: cloneArgs(args),
        caller,
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
    const callerInfo = _captureStack ? getCallerInfoAt(4) : undefined;
    const caller = callerInfo ? formatCallerString(callerInfo) : undefined;
    const traceCaller = TRACE_LEVELS.has(level)
      ? getCallerStackTraceAt(4)
      : undefined;
    send({
      type: 'log',
      level,
      args: cloneArgs(args),
      caller,
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
    // The scope proxy shares the root's send function — it is unaware of the
    // queue/transport distinction and works identically before and after the
    // transport resolves.
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
        // Mirror flags locally to avoid unnecessary IPC.
        if (key === 'stack') _captureStack = value === true;
        if (key === 'enabled') _enabled = value !== false;
        send({ type: 'opt:set', key, value });
      },
      enumerable: true,
      configurable: true,
    });
  }

  Object.defineProperty(base, 'format', {
    get: () => undefined,
    set: (value: RootLogger['format']) => {
      send({ type: 'opt:format', value });
    },
    enumerable: true,
    configurable: true,
  });

  Object.defineProperty(base, 'exclusive', {
    get: () => false,
    set: (value: boolean) => {
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

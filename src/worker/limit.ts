import { LogLevels } from '../levels';
import type { LimitedLogger, LogLevel, LogParameters } from '../types';
import { getCallerInfoAt } from '../utils/stack';
import type { WorkerMessage } from './protocol';

// ── LimitSendFn ───────────────────────────────────────────────────────────────

/** Local alias for the IPC send function — mirrors SendFn in index.ts. */
export type LimitSendFn = (msg: WorkerMessage) => void;

// ── Call-site key ─────────────────────────────────────────────────────────────

/**
 * Captures the call-site of user code as a stable string key.
 *
 * Stack frames when called from inside once() or limit():
 *   [0]  Error
 *   [1]  at getCallSiteKey      (this file)
 *   [2]  at once / limit        (createWorkerLimitMixin)
 *   [3]  at <user call-site>    ← what we want
 */
function getCallSiteKey(): string {
  return new Error().stack?.split('\n')[3]?.trim() ?? 'unknown';
}

// ── cloneArgs (local copy — avoids importing from index.ts) ──────────────────

function cloneArgs(args: LogParameters): unknown[] {
  return args.map((arg) => {
    try {
      return structuredClone(arg);
    } catch {
      try {
        return String(arg);
      } catch {
        return '[unserializable]';
      }
    }
  });
}

// ── buildLimitedProxy ─────────────────────────────────────────────────────────

/**
 * Returns a LimitedLogger that sends a 'log' message enriched with `key` and
 * `max` so the worker delegates to `Logger.once(key)` / `Logger.limit(max, key)`.
 * The counter map lives entirely in the worker — no state is held here.
 *
 * @param key          - Rate-limiting key (call-site or explicit user key).
 * @param max          - Maximum allowed emissions (1 = once semantics).
 * @param sendFn       - IPC send function shared with the proxy.
 * @param captureStack - Getter returning whether stack capture is active.
 * @param scopeName    - Optional scope name forwarded to the worker.
 */
function buildLimitedProxy(
  key: string,
  max: number,
  sendFn: LimitSendFn,
  captureStack: () => boolean,
  scopeName?: string,
): LimitedLogger {
  const logLevel = (level: LogLevel, args: LogParameters) => {
    let caller: string | undefined;
    if (captureStack()) {
      const info = getCallerInfoAt(2);
      if (info?.fileName) {
        // Omit the function name — it is engine-dependent and changes under
        // minification, making it an unreliable prefix. file:line:col is the
        // only stable, copy-pasteable reference across all environments.
        caller = `${info.fileName}:${info.lineNumber}:${info.columnNumber}`;
      }
    }
    sendFn({
      type: 'log',
      level,
      scope: scopeName !== undefined ? { name: scopeName } : undefined,
      args: cloneArgs(args),
      caller,
      key,
      ts: Date.now(),
      ...(max > 1 ? { max } : {}),
    });
  };

  const result = {
    log: (level: LogLevel, ...args: LogParameters) => logLevel(level, args),
  } as unknown as LimitedLogger;

  for (const level of LogLevels) {
    (result as unknown as Record<string, unknown>)[level] = (
      ...args: LogParameters
    ) => logLevel(level, args);
  }

  return result;
}

// ── createWorkerLimitMixin ────────────────────────────────────────────────────

/**
 * Returns `{ once, limit }` to be mixed into a worker proxy object.
 *
 * Without an explicit key, the call-site is captured in the main process
 * (correct file + line) and sent as `key` in the IPC message so the worker
 * delegates to `Logger.once(key)` / `Logger.limit(max, key)`.
 *
 * With an explicit key, it is forwarded as-is — same semantics as `L.once(key)`.
 *
 * @param sendFn       - The proxy's shared IPC send function.
 * @param captureStack - Getter returning whether stack capture is active.
 * @param scopeName    - Optional scope name to attach to every message.
 */
export function createWorkerLimitMixin(
  sendFn: LimitSendFn,
  captureStack: () => boolean,
  scopeName?: string,
): {
  once: (key?: string) => LimitedLogger;
  limit: (count: number, key?: string) => LimitedLogger;
} {
  return {
    once(key?: string): LimitedLogger {
      const resolvedKey = key ?? getCallSiteKey();
      return buildLimitedProxy(resolvedKey, 1, sendFn, captureStack, scopeName);
    },
    limit(count: number, key?: string): LimitedLogger {
      const resolvedKey = key ?? getCallSiteKey();
      return buildLimitedProxy(
        resolvedKey,
        count,
        sendFn,
        captureStack,
        scopeName,
      );
    },
  };
}

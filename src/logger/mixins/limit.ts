import { LogLevels } from '../../levels';
import type { DispatchFn } from '../dispatch';
import type { LimitedLogger, LogLevel, LogParameters } from '../types';

// ── Call-site key ─────────────────────────────────────────────────────────────

/**
 * Captures the call-site of the caller's caller as a stable string key.
 *
 * Stack frames when this is called from inside `limit()` or `once()`:
 *   [0] "Error"
 *   [1]  at getLimitCallerKey  (this file)
 *   [2]  at limit / once       (mixin method)
 *   [3]  at <user call-site>   ← what we want
 *
 * This means a line like `L.limit(3).debug(x)` inside a loop always resolves
 * to the same key, so the counter accumulates correctly across iterations.
 */
function getLimitCallerKey(): string {
  return new Error().stack?.split('\n')[3]?.trim() ?? 'unknown';
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single entry in the limit counter map. */
type LimitEntry = {
  /** Number of log calls emitted so far for this key. */
  count: number;
  /** Maximum number of calls allowed before the logger goes silent. */
  max: number;
};

// ── buildLimited ──────────────────────────────────────────────────────────────

/**
 * Constructs a `LimitedLogger` backed by the entry at `key`.
 * Each log call checks and increments the shared counter — if the entry's
 * `count` has reached `max`, the call is silently dropped.
 * Routes through the underlying `logger`'s level methods so all formatting,
 * level-filtering and enabled checks are applied normally.
 */
function buildLimited(
  key: string,
  entries: Map<string, LimitEntry>,
  dispatch: DispatchFn,
): LimitedLogger {
  // +2 accounts for the two extra frames introduced by limit/once:
  //   logLevel (buildLimited) + anonymous closure (LimitedLogger level method)
  const STACK_OFFSET = 2;

  const logLevel = (level: LogLevel, args: LogParameters) => {
    const entry = entries.get(key);
    if (!entry || entry.count >= entry.max) return;
    entry.count++;
    dispatch(level, args, { stackOffset: STACK_OFFSET });
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

// ── createLimitMixin ──────────────────────────────────────────────────────────

/**
 * Returns `{ once, limit }` to be mixed into a fully-initialised logger via
 * a second `Object.assign(self, createLimitMixin(self))`.
 *
 * Calling it after the logger's level methods are all attached ensures
 * `logger.debug` etc. are already the real `LogMethod` implementations.
 *
 * The counter map lives entirely in this closure — `index.ts` is unaware of it.
 */
export function createLimitMixin(dispatch: DispatchFn) {
  const entries = new Map<string, LimitEntry>();

  function registerIfAbsent(key: string, max: number) {
    if (!entries.has(key)) {
      entries.set(key, { count: 0, max });
    }
  }

  return {
    once(key?: string): LimitedLogger {
      const resolvedKey = key ?? getLimitCallerKey();
      registerIfAbsent(resolvedKey, 1);
      return buildLimited(resolvedKey, entries, dispatch);
    },

    limit(count: number, key?: string): LimitedLogger {
      const resolvedKey = key ?? getLimitCallerKey();
      registerIfAbsent(resolvedKey, count);
      return buildLimited(resolvedKey, entries, dispatch);
    },
  };
}

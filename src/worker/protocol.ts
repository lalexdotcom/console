import type { LoggerOptions, LogLevel, SpinnerOptions, SpinnerUpdateOptions } from '../types';

// ── WorkerMessage ─────────────────────────────────────────────────────────────

/**
 * All messages sent from the main-thread proxy to the worker/fork script.
 * Each variant is discriminated by `type`.
 *
 * `args` are transferred via structuredClone (Node IPC serialises automatically;
 * Web Worker MessageChannel uses structured-clone algorithm natively).
 */
export type WorkerMessage =
  | {
      /** Plain log line at a given level. */
      type: 'log';
      level: LogLevel;
      /** Optional scope — undefined means root logger. */
      scope?: { name: string; options?: Partial<LoggerOptions> };
      args: unknown[];
      /**
       * Call-site string pre-captured in the main process.
       * Defined only when `WL.stack = true`; absent otherwise.
       * When present, bypasses worker-side stack introspection.
       */
      caller?: string;
      /**
       * Call-site string captured for trace-level display only.
       * Never added to the prefix — displayed as a separate line after the log.
       * Set for all TRACE_LEVELS when `_captureStack` is false, on both Node
       * and browser, so the worker can show a user-originated stack trace.
       */
      traceCaller?: string;
      /**
       * When true, the `caller` field should appear only in structured output
       * (JSON/logfmt) and be hidden in pretty renderers.
       * Set for TRACE_LEVELS without stack=true: the full stack trace is shown
       * in pretty mode, so a prefix badge would be redundant.
       */
      callerStructuredOnly?: boolean;
      /**
       * Rate-limiting key captured in the main process.
       * Present only when the call originates from `.once()` or `.limit()`.
       * The worker uses this to call `Logger.once(key)` / `Logger.limit(max, key)`
       * so the counter map lives in the worker — the single source of truth.
       * - `key` only → `max` defaults to 1 (once semantics).
       * - `key` + `max` → `Logger.limit(max, key)`.
       */
      key?: string;
      /** Maximum number of emissions. Defined only when `key` is present and `max > 1`. */
      max?: number;
      /** Unix timestamp (ms) captured via Date.now() in the main process at call time. */
      ts: number;
    }
  | {
      /** Start a new spinner. */
      type: 'spin:start';
      id: string;
      level: LogLevel;
      scope?: { name: string; options?: Partial<LoggerOptions> };
      message: string;
      options?: Omit<SpinnerOptions, 'text'>;
    }
  | {
      /** Update a running spinner's text and/or visual options. */
      type: 'spin:update';
      id: string;
      text: string;
      options?: SpinnerUpdateOptions;
    }
  | {
      /** Mark a spinner as succeeded. */
      type: 'spin:success';
      id: string;
      text?: string;
      options?: SpinnerUpdateOptions;
    }
  | {
      /** Mark a spinner as failed. */
      type: 'spin:fail';
      id: string;
      text?: string;
      options?: SpinnerUpdateOptions;
    }
  | {
      /** Stop and remove a spinner with no final status. */
      type: 'spin:stop';
      id: string;
    }
  | {
      /** Set a root-level option (e.g. `enabled`, `level`, `color`, …). */
      type: 'opt:set';
      key: keyof LoggerOptions;
      value: unknown;
    }
  | {
      /** Change the output format (non-TTY Node only). */
      type: 'opt:format';
      value: 'pretty' | 'json' | 'logfmt';
    }
  | {
      /**
       * Activate or release the exclusive lock on the worker-side logger.
       * Maps to `Logger.exclusive = value`.
       */
      type: 'opt:exclusive';
      value: boolean;
    };
